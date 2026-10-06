import sys
import json
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local-agent'))
from orion_progress import NodeODMProgress, choose_concurrency
from orion_runtime import recover_task_id, worker_lock, heartbeat_loop
from unittest.mock import Mock, patch

TASK='e9b7be84-7b92-4fc0-aac5-f28fc683c7d4'

class ProgressTests(unittest.TestCase):
    def test_matching_counts_unique_pairs_not_percentage(self):
        p=NodeODMProgress()
        p.consume(['DEBUG: Matching a.JPG and b.JPG.  Matcher: FLANN Matches: 600',
                   'DEBUG: Matching b.JPG and a.JPG.  Matcher: FLANN Matches: 600'])
        self.assertEqual(p.describe(93), 'Correlacionando fotos - 1 pares comparados')
        self.assertEqual(p.offset,2)
    def test_started_feature_is_not_declared_completed(self):
        p=NodeODMProgress();p.consume(['INFO: Extracting ROOT_DSPSIFT features for image a.JPG'])
        self.assertEqual(p.describe(93),'Extraindo pontos visuais - imagem 1 de 93')
    def test_reconstruction_changes_phase(self):
        p=NodeODMProgress();p.consume(['INFO: Adding a.JPG to the reconstruction'])
        self.assertIn('1 fotos adicionadas',p.describe())
    def test_later_stage_replaces_old_counts(self):
        p=NodeODMProgress();p.consume(['INFO: Adding a.JPG to the reconstruction','[INFO] Running openmvs stage'])
        self.assertEqual(p.describe(),'Reconstruindo a nuvem densa')
    def test_no_fake_increment_on_empty_output(self):
        p=NodeODMProgress();self.assertFalse(p.consume([]));self.assertEqual(p.offset,0)
    def test_unrelated_logs_do_not_increment_pairs(self):
        p=NodeODMProgress();p.consume(['INFO: Matching started','INFO: 10000 features'])
        self.assertEqual(len(p.pairs),0)
    def test_high_quality_is_limited_by_memory(self):
        self.assertEqual(choose_concurrency({'cpuCores':16,'availableMemory':11*1024**3},{'quality':'high'}),2)
    def test_balanced_is_not_unlimited(self):
        self.assertEqual(choose_concurrency({'cpuCores':16,'availableMemory':11*1024**3},{'quality':'balanced'}),3)
    def test_low_memory_stays_safe(self):
        self.assertEqual(choose_concurrency({'cpuCores':16,'availableMemory':2*1024**3},{}),1)
    def test_user_cap_respected(self):
        self.assertEqual(choose_concurrency({'cpuCores':16,'availableMemory':16*1024**3},{'max_concurrency':1}),1)
    def test_missing_or_invalid_resources_fall_back(self):
        for info in ({},{'availableMemory':float('nan')},{'cpuCores':'unknown'}):
            self.assertEqual(choose_concurrency(info,{}),1)

class RecoveryTests(unittest.TestCase):
    def test_recovery_uses_identical_engine_uuid(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'engine_task.json').write_text(json.dumps({'job_id':'job','engine_task_uuid':TASK}))
            self.assertEqual(recover_task_id({'id':'job','status':'processing','engine_task_uuid':TASK},root),TASK)
    def test_missing_checkpoint_never_creates_new_task(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(RuntimeError):
                recover_task_id({'id':'job','status':'processing','engine_task_uuid':TASK},Path(d))
    def test_mismatched_checkpoint_is_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'engine_task.json').write_text(json.dumps({'job_id':'other','engine_task_uuid':TASK}))
            with self.assertRaises(RuntimeError):
                recover_task_id({'id':'job','status':'processing','engine_task_uuid':TASK},root)
    def test_queued_job_does_not_resume(self):
        self.assertIsNone(recover_task_id({'status':'queued'},Path('.')))
    def test_single_worker_lock(self):
        with tempfile.TemporaryDirectory() as d:
            with worker_lock(Path(d)):
                with self.assertRaises(RuntimeError):
                    with worker_lock(Path(d)):pass
    def test_heartbeat_network_failure_is_contained(self):
        stop=Mock();stop.is_set.side_effect=[False,True]
        heartbeat_loop(stop,Mock(side_effect=ConnectionError('offline')),'device','http://127.0.0.1:3000','test')
        stop.wait.assert_called_with(15)

if __name__=='__main__':unittest.main()
