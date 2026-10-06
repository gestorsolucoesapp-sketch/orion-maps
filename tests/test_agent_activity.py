"""Activity proves observed file changes, never estimated completion."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local-agent'))
from orion_activity import ActivityTracker, read_container, parse_probe_output

TASK='00000000-0000-4000-8000-000000000019'

def info(progress=24.75,code=20):
    return {'uuid':TASK,'status':{'code':code},'progress':progress}

def probe(count=21,modified=990,size=100):
    return {'groups':{'depth_maps':{'count':count,'bytes':count*size,'modified_ms':modified*1000}},'latest':{'name':f'depth{count-1:04d}.dmap','modified_ms':modified*1000}}

class ActivityTests(unittest.TestCase):
    def test_node_version_preamble_is_not_telemetry(self):
        result=parse_probe_output('Now using node v14.21.3 (npm v6.14.18)\n{"groups":{},"checked_ms":123}\n')
        self.assertEqual(result["groups"],{})

    def test_missing_probe_json_is_rejected(self):
        with self.assertRaises(ValueError):parse_probe_output("Now using node v14")

    def test_first_sample_is_not_new_progress(self):
        a=ActivityTracker(TASK).update(info(),probe(),{'cpu_percent':100},'Dense',now=1000)
        self.assertEqual(a['depth_maps_added'],0)
        self.assertEqual(a['engine_progress'],24.75)
        self.assertEqual(a['events'],[])
        self.assertNotIn('progress',a)

    def test_more_files_prove_activity_at_unchanged_percent(self):
        t=ActivityTracker(TASK);t.update(info(),probe(),{},'Dense',now=1000)
        a=t.update(info(),probe(22,1005),{},'Dense',now=1010)
        self.assertEqual(a['state'],'advancing')
        self.assertEqual(a['depth_maps_added'],1)
        self.assertIn('+1',a['events'][0]['message'])

    def test_busy_cpu_is_not_claimed_as_file_progress(self):
        a=ActivityTracker(TASK).update(info(),probe(21,10),{'cpu_percent':100},'Dense',now=1000)
        self.assertEqual(a['state'],'computing')
        self.assertEqual(a['depth_maps_added'],0)
        self.assertEqual(a['events'],[])

    def test_no_cpu_or_output_activity_after_baseline_is_quiet_not_failed(self):
        t=ActivityTracker(TASK);t.update(info(),probe(21,10),{'cpu_percent':0},'Dense',now=1000)
        a=t.update(info(),probe(21,10),{'cpu_percent':0},'Dense',now=1200)
        self.assertEqual(a['state'],'quiet')
        self.assertEqual(a['engine_status'],20)

    def test_probe_failure_is_unknown_not_zero_files(self):
        a=ActivityTracker(TASK).update(info(),None,None,'Dense',now=1000)
        self.assertEqual(a['state'],'unavailable')
        self.assertIsNone(a['depth_maps'])

    def test_wrong_uuid_rejected(self):
        wrong=info();wrong['uuid']='different'
        with self.assertRaises(ValueError):ActivityTracker(TASK).update(wrong,probe(),{},'Dense')

    def test_path_traversal_never_invokes_docker(self):
        with patch('orion_activity.subprocess.run') as run:
            with self.assertRaises(ValueError):read_container('../other-task')
            run.assert_not_called()

    def test_file_rewrite_also_counts_as_activity(self):
        t=ActivityTracker(TASK);t.update(info(),probe(),{},'Dense',now=1000)
        a=t.update(info(),probe(21,1005,110),{},'Dense',now=1010)
        self.assertEqual(a['state'],'advancing')
        self.assertEqual(a['depth_maps_added'],0)
        self.assertTrue(a['events'])

    def test_future_file_timestamp_does_not_forge_activity(self):
        a=ActivityTracker(TASK).update(info(),probe(21,999999),{'cpu_percent':0},'Dense',now=1000)
        self.assertIsNone(a['last_change_at'])
        self.assertEqual(a['state'],'observing')

    def test_history_bounded_and_json_serializable(self):
        t=ActivityTracker(TASK)
        for i in range(50):a=t.update(info(),probe(i,1000+i),{},'Dense',now=1000+i)
        self.assertEqual(len(a['history']),30)
        self.assertLessEqual(len(a['events']),6)
        json.dumps(a,allow_nan=False)

    def test_completed_engine_is_not_completed_orion_job(self):
        a=ActivityTracker(TASK).update(info(100,40),probe(),{},'Dense',now=1000)
        self.assertEqual(a['state'],'engine_completed')
        self.assertNotIn('status',a)

    def test_cleanup_does_not_create_negative_progress(self):
        t=ActivityTracker(TASK);t.update(info(),probe(30),{},'Dense',now=1000)
        a=t.update(info(),probe(0,1001),{},'Filtering',now=1010)
        self.assertEqual(a['depth_maps_added'],0)

    def test_recovered_same_files_do_not_forge_progress(self):
        t=ActivityTracker(TASK);t.update(info(),probe(21,10),{'cpu_percent':0},'Dense',now=1000)
        t.update(info(),None,{'cpu_percent':0},'Dense',now=1100)
        a=t.update(info(),probe(21,10),{'cpu_percent':0},'Dense',now=1300)
        self.assertEqual(a['state'],'quiet')
        self.assertEqual(a['events'],[])

    def test_partial_probe_error_is_not_output_change(self):
        t=ActivityTracker(TASK);t.update(info(),probe(21,10),{'cpu_percent':0},'Dense',now=1000)
        a=t.update(info(),{'groups':{'depth_maps':{'error':'EACCES'}}},{'cpu_percent':0},'Dense',now=1100)
        self.assertEqual(a['events'],[])
        self.assertFalse(a['files_available'])

    def test_first_success_after_probe_failure_creates_baseline(self):
        t=ActivityTracker(TASK);t.update(info(),None,{'cpu_percent':0},'Dense',now=1000)
        a=t.update(info(),probe(21,10),{'cpu_percent':0},'Dense',now=1100)
        self.assertEqual(a['depth_maps_added'],0)
        self.assertEqual(a['events'],[])

if __name__=='__main__':unittest.main()
