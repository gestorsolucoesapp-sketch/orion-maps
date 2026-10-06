from __future__ import annotations

import json
import logging
from pathlib import Path

import requests
import orion_agent as agent


def staged_nodeodm_new_task(images: list[Path], config: dict) -> str:
    resolution = float(config.get("orthophoto_resolution_cm", 5))
    quality = str(config.get("quality", "balanced"))
    options = [
        {"name": "orthophoto-resolution", "value": resolution},
        {"name": "max-concurrency", "value": 1},
        {"name": "pc-quality", "value": "high" if quality == "high" else "medium"},
    ]
    init = requests.post(
        f"{agent.NODEODM}/task/new/init",
        data={"options": json.dumps(options)},
        timeout=60,
    )
    init.raise_for_status()
    payload = init.json()
    task_id = str(payload.get("uuid") or payload.get("id") or "")
    if not task_id:
        raise RuntimeError(f"NodeODM did not return a task id: {payload}")

    try:
        for path in images:
            with open(path, "rb") as handle:
                response = requests.post(
                    f"{agent.NODEODM}/task/new/upload/{task_id}",
                    files={"images": (path.name, handle, "image/jpeg")},
                    timeout=600,
                )
                response.raise_for_status()

        commit = requests.post(
            f"{agent.NODEODM}/task/new/commit/{task_id}",
            timeout=60,
        )
        commit.raise_for_status()
        committed = commit.json()
        return str(committed.get("uuid") or committed.get("id") or task_id)
    except Exception:
        logging.exception("Staged NodeODM upload failed for %s", task_id)
        raise


agent.nodeodm_new_task = staged_nodeodm_new_task

if __name__ == "__main__":
    agent.main()
