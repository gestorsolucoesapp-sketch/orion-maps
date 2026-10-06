"""Companion monitor: observes the existing task, writes activity only, never restarts ODM."""
from __future__ import annotations
import argparse
import ast
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import platform
import time
from urllib.parse import urlsplit
from uuid import UUID
import keyring
import requests
from supabase import create_client
from orion_activity import ActivityTracker, read_container, read_resources, MONITOR_VERSION
from orion_progress import NodeODMProgress
from orion_runtime import worker_lock

ACTIVE = ['processing', 'derivatives', 'uploading']


def settings(root: Path) -> dict:
    tree = ast.parse((root/'agent'/'orion_agent.py').read_text(encoding='utf-8-sig'))
    data = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ('SERVICE','SUPABASE_URL','SUPABASE_KEY'):
                    data[target.id] = node.value.value
    if len(data) != 3:
        raise RuntimeError('Installed agent configuration unavailable')
    return data


def login(config: dict):
    email = keyring.get_password(config['SERVICE'], 'account')
    password = keyring.get_password(config['SERVICE'], email) if email else None
    if not email or not password:
        raise RuntimeError('Existing Orion credentials unavailable for this Windows account')
    client = create_client(config['SUPABASE_URL'], config['SUPABASE_KEY'])
    user = client.auth.sign_in_with_password({'email': email, 'password': password}).user
    if not user:
        raise RuntimeError('Authentication failed')
    return client, user


def run(root: Path, once: bool = False):
    config = settings(root)
    node = os.environ.get('ORION_NODEODM_URL','http://127.0.0.1:3000').rstrip('/')
    local_engine = urlsplit(node).hostname in ('127.0.0.1','localhost','::1')
    client = user = tracker = progress = None
    previous_id = None
    logger = logging.getLogger('orion_activity')
    with worker_lock(root/'activity-monitor'):
        logger.info('Activity monitor %s started; read-only engine inspection', MONITOR_VERSION)
        while True:
            began = time.monotonic()
            try:
                if client is None:
                    client, user = login(config)
                devices = client.table('processing_devices').select('id,enabled').eq('user_id',user.id).eq('name',platform.node()).limit(1).execute().data or []
                if not devices or not devices[0].get('enabled'):
                    if once:
                        raise RuntimeError('Enabled processing device unavailable')
                    time.sleep(15)
                    continue
                rows = client.table('processing_jobs').select('id,owner_id,status,stage,device_id,engine_task_uuid').eq('owner_id',user.id).eq('device_id',devices[0]['id']).in_('status',ACTIVE).order('created_at').limit(1).execute().data or []
                if not rows or not rows[0].get('engine_task_uuid'):
                    if once:
                        print(json.dumps({'monitor':'idle','version':MONITOR_VERSION}))
                        return
                    time.sleep(10)
                    continue
                job = rows[0]
                task_id = str(UUID(str(job['engine_task_uuid'])))
                if previous_id != (job['id'],task_id):
                    tracker, progress = ActivityTracker(task_id), NodeODMProgress()
                    previous_id = (job['id'],task_id)
                response = requests.get(f'{node}/task/{task_id}/info',timeout=6)
                response.raise_for_status()
                info = response.json()
                if not isinstance(info,dict) or info.get('uuid') != task_id or info.get('error'):
                    raise RuntimeError('NodeODM task could not be verified')
                log_count = 0
                try:
                    response = requests.get(f'{node}/task/{task_id}/output',params={'line':progress.offset},timeout=5)
                    response.raise_for_status()
                    lines = response.json()
                    if isinstance(lines,list):
                        log_count = len(lines)
                        progress.consume(lines)
                except (requests.RequestException,ValueError,TypeError):
                    pass
                probe = resources = None
                if local_engine:
                    try:
                        probe = read_container(task_id)
                    except Exception as exc:
                        logger.warning('Files inspection unavailable: %s',type(exc).__name__)
                    try:
                        resources = read_resources()
                    except Exception as exc:
                        logger.warning('Resource inspection unavailable: %s',type(exc).__name__)
                sample = tracker.update(info,probe,resources,progress.describe(),new_log_lines=log_count)
                sample['job_id'] = str(job['id'])
                # Never update status/progress/heartbeat or call task/new, cancel, claim or restart.
                # Conditional update avoids writing into another/replaced/finished task.
                client.table('processing_jobs').update({'activity':sample}).eq('id',job['id']).eq('owner_id',user.id).eq('device_id',devices[0]['id']).eq('engine_task_uuid',task_id).in_('status',ACTIVE).execute()
                logger.info('job=%s state=%s depth_maps=%s cpu=%s',job['id'],sample['state'],sample['depth_maps'],sample['cpu_percent'])
                if once:
                    print(json.dumps(sample,ensure_ascii=False))
                    return
            except KeyboardInterrupt:
                return
            except Exception as exc:
                # Avoid logging exception text that could include URLs/tokens.
                logger.warning('Monitor sample unavailable: %s',type(exc).__name__)
                if client is not None:
                    try:
                        client.auth.stop_auto_refresh()
                    except Exception:
                        pass
                client = None
                if once:
                    raise
            time.sleep(max(1,10-(time.monotonic()-began)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root',default=os.environ.get('ORION_ROOT',r'D:\OrionMaps'))
    parser.add_argument('--once',action='store_true')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    (root/'logs').mkdir(parents=True,exist_ok=True)
    logger = logging.getLogger('orion_activity')
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(root/'logs'/'activity.log',maxBytes=2_000_000,backupCount=3,encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    logger.addHandler(handler)
    run(root,args.once)
