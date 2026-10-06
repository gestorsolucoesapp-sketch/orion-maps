"""Independent liveness, single worker lock and checked task recovery."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from uuid import UUID
import requests


@contextmanager
def worker_lock(root: Path):
    root.mkdir(parents=True, exist_ok=True)
    handle = (root / "agent.lock").open("a+b")
    try:
        if handle.tell() == 0:
            handle.write(b"0"); handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        handle.close()
        raise RuntimeError("Outro agente Orion ja esta executando; segunda instancia recusada.") from exc
    try:
        yield
    finally:
        handle.close()


def recover_task_id(job: dict, root: Path) -> str | None:
    if job.get("status") != "processing":
        return None
    try:
        task_id = str(UUID(str(job["engine_task_uuid"])))
        checkpoint = json.loads((root / "engine_task.json").read_text(encoding="utf-8"))
        if checkpoint.get("job_id") != str(job["id"]) or checkpoint.get("engine_task_uuid") != task_id:
            raise ValueError("identidade divergente")
        return task_id
    except (OSError, KeyError, ValueError, TypeError) as exc:
        raise RuntimeError("Retomada bloqueada: UUID/checkpoint nao confere. Nenhuma nova tarefa sera criada.") from exc


def heartbeat_loop(stop, login, device_id: str, nodeodm: str, version: str):
    # This thread owns its own authenticated client; never shares a sync SDK client.
    sb = None
    while not stop.is_set():
        try:
            if sb is None:
                sb, _user = login()
            rows = sb.table("processing_devices").select("enabled,capabilities").eq("id", device_id).limit(1).execute().data or []
            if not rows or not rows[0].get("enabled"):
                stop.wait(15)
                continue
            caps = dict(rows[0].get("capabilities") or {})
            checked_at = datetime.now(timezone.utc).isoformat()
            try:
                response = requests.get(f"{nodeodm}/info", timeout=5)
                response.raise_for_status()
                info = response.json()
                engine_ok = isinstance(info, dict) and bool(info.get("engine"))
            except (requests.RequestException, ValueError):
                engine_ok = False
            caps.update({"agent_version": version, "nodeodm_reachable": engine_ok,
                         "engine_checked_at": checked_at, "heartbeat_mode": "independent-thread"})
            sb.table("processing_devices").update({"last_seen": checked_at, "capabilities": caps}).eq("id", device_id).eq("enabled", True).execute()
        except Exception as exc:
            logging.warning("Heartbeat independente: %s; o calculo local nao sera interrompido.", type(exc).__name__)
            if sb is not None:
                try:
                    sb.auth.stop_auto_refresh()
                except Exception:
                    pass
            sb = None
        stop.wait(15)
