"""Read-only NodeODM activity probe. Never changes jobs, tasks or processing files."""
from __future__ import annotations
import json
import math
import subprocess
import time
from datetime import datetime, timezone
from uuid import UUID
import requests

MONITOR_VERSION = "0.3.19"
# Inspect fixed directories only, with bounded listings. Never open raster/image data.
PROBE_JS = r"""
const fs=require('fs'),path=require('path');
const id=process.argv[2];
if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('invalid task');
const root=path.resolve('/var/www/data',id);
const groups={depth_maps:['opensfm/undistorted/openmvs/depthmaps',/^depth\d+\.dmap$/i],features:['opensfm/features',/\.(npz|npy)$/i],matches:['opensfm/matches',/\.(gz|pkl|npz)$/i],elevation:['odm_dem',/\.tif$/i],orthophoto:['odm_orthophoto',/\.(tif|png)$/i],cloud:['odm_georeferencing',/\.(laz|las|ply)$/i]};
let latest=null;const out={};
for(const [key,[rel,pattern]] of Object.entries(groups)){
 let count=0,bytes=0,modified=0,truncated=false;
 try{
  const dir=path.join(root,rel),real=fs.realpathSync(dir);
  if(!real.startsWith(root+path.sep))throw Error('unexpected path');
  const entries=fs.readdirSync(dir,{withFileTypes:true});truncated=entries.length>10000;
  for(const e of entries.slice(0,10000)){
   if(!e.isFile()||!pattern.test(e.name))continue;
   try{const s=fs.statSync(path.join(dir,e.name));if(s.size<=0)continue;
    count++;bytes+=s.size;modified=Math.max(modified,s.mtimeMs);
    if(!latest||s.mtimeMs>latest.modified_ms)latest={name:e.name.slice(0,180),group:key,modified_ms:s.mtimeMs,bytes:s.size};
   }catch{}
  }
  out[key]={count,bytes,modified_ms:modified,truncated};
 }catch(e){if(e.code==='ENOENT')out[key]={count:0,bytes:0,modified_ms:0,truncated:false};else out[key]={error:e.code||'unavailable'};}
}
console.log(JSON.stringify({groups:out,latest,checked_ms:Date.now()}));
"""


def iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def finite(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def read_container(task_id: str) -> dict:
    task_id = str(UUID(task_id))
    result = subprocess.run(['docker', 'exec', '-i', 'orion-nodeodm', 'node', '-', task_id],
                            input=PROBE_JS, capture_output=True, text=True, encoding='utf-8', timeout=8, check=True)
    return parse_probe_output(result.stdout)


def parse_probe_output(output: str) -> dict:
    # The official image wraps node with nvm and prints its version before stdout.
    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if isinstance(value, dict) and isinstance(value.get("groups"), dict) and finite(value.get("checked_ms")) is not None:
            return value
    raise ValueError("No valid activity sample from container")


def read_resources() -> dict:
    result = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{json .}}', 'orion-nodeodm'],
                            capture_output=True, text=True, encoding='utf-8', timeout=8, check=True)
    data = json.loads(result.stdout.strip())
    cpu = finite(str(data.get('CPUPerc', '')).rstrip('%'))
    mem = str(data.get('MemUsage', ''))[:100]
    return {'cpu_percent': cpu, 'memory': mem, 'scope': 'nodeodm_container'}


class ActivityTracker:
    """Separate liveness, CPU work, and observed output changes; no invented percent."""
    def __init__(self, task_id: str):
        self.task_id = str(UUID(task_id))
        self.previous = None
        self.last_change = None
        self.started = None
        self.history = []
        self.events = []
        self.observed_depth = None

    def update(self, info: dict, probe: dict | None, resources: dict | None,
               phase: str, *, new_log_lines: int = 0, now: float | None = None) -> dict:
        now = time.time() if now is None else now
        if str(info.get('uuid')) != self.task_id:
            raise ValueError('Task identity mismatch')
        progress = finite(info.get('progress'))
        if progress is not None:
            progress = min(100, max(0, progress))
        groups = (probe or {}).get('groups') or {}
        latest = (probe or {}).get('latest')
        signature = {k:(v.get('count'),v.get('bytes'),v.get('modified_ms')) for k,v in groups.items() if 'error' not in v}
        depth = groups.get('depth_maps', {}).get('count')
        cpu = (resources or {}).get('cpu_percent')
        modified = finite((latest or {}).get('modified_ms'))
        modified = modified / 1000 if modified is not None else None
        # Ignore impossible future timestamps instead of claiming recent progress.
        if modified is not None and modified > now + 5:
            modified = None
        if self.started is None:
            self.started = now
            self.last_change = modified
            self.observed_depth = depth
        previous_signature = self.previous['signature'] if self.previous else {}
        # A failed probe/recovered connection is not evidence of calculation progress.
        changed_files = any(signature[k] != previous_signature[k] for k in signature.keys() & previous_signature.keys())
        if self.observed_depth is None and depth is not None:
            self.observed_depth = depth
        progressed = self.previous is not None and progress is not None and self.previous['progress'] is not None and progress > self.previous['progress']
        new_logs = self.previous is not None and new_log_lines > 0
        if changed_files or progressed or new_logs:
            self.last_change = now
        delta = depth - self.previous['depth'] if self.previous and depth is not None and self.previous['depth'] is not None else 0
        if delta > 0:
            self.events.append({'at':iso(now),'message':f'+{delta} mapa(s) de profundidade; {depth} arquivos gravados.'})
        elif progressed:
            self.events.append({'at':iso(now),'message':f'O motor avancou para {progress:.2f}%.'})
        elif changed_files:
            self.events.append({'at':iso(now),'message':'O motor atualizou arquivos intermediarios.'})
        elif new_logs:
            self.events.append({'at':iso(now),'message':'Nova atividade registrada no log do motor.'})
        self.events = self.events[-6:]
        age = max(0, now-self.last_change) if self.last_change is not None else None
        status = (info.get('status') or {}).get('code')
        if status == 40:
            state = 'engine_completed'
        elif status in (30, 50):
            state = 'engine_stopped'
        elif probe is None and resources is None:
            state = 'unavailable'
        elif age is not None and age <= 120:
            state = 'advancing'
        elif cpu is not None and cpu >= 1:
            state = 'computing'
        elif now-self.started < 120:
            state = 'observing'
        else:
            state = 'quiet'
        self.history.append({'at':iso(now),'depth_maps':depth,'cpu_percent':cpu})
        self.history = self.history[-30:]
        self.previous = {'signature':{**previous_signature, **signature},'progress':progress,
                         'depth':depth if depth is not None else (self.previous['depth'] if self.previous else None)}
        return {'schema_version':1,'monitor_version':MONITOR_VERSION,'engine_task_uuid':self.task_id,
                'sampled_at':iso(now),'state':state,'phase':phase,'engine_progress':progress,
                'engine_status':status,'last_change_at':iso(self.last_change) if self.last_change is not None else None,
                'depth_maps':depth,'depth_maps_added':max(0,depth-self.observed_depth) if depth is not None and self.observed_depth is not None else None,
                'depth_maps_truncated':groups.get('depth_maps',{}).get('truncated',False),
                'latest_file':{'name':latest['name'],'modified_at':iso(modified)} if latest and modified is not None else None,
                'cpu_percent':cpu,'memory':(resources or {}).get('memory'),
                'resources_scope':'nodeodm_container','files_available':bool(signature),
                'resources_available':resources is not None,'events':self.events,'history':self.history,
                'notice':'Arquivos intermediarios gravados; nao equivalem a fotos concluidas. CPU e memoria sao do container.'}
