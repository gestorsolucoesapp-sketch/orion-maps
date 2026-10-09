"""Local-only bridge between Orion Maps and a USB-connected DJI RC 2."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import subprocess
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from mission import build, length_m

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("ORION_RC2_DATA", r"D:\OrionMaps\rc2-transfers"))
MISSION_ID = "F42D349D-2919-4FE5-9AEB-0A19D759B018"
PORT = 48765
ORIGINS = {"https://orion-maps.vercel.app", "http://localhost:3009"}
LOCK = threading.Lock()
ROOT.mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename=ROOT / "helper.log", level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mtp(operation: str, directory: Path | None = None,
        source: Path | None = None, expected_hash: str = "") -> dict:
    args = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", str(HERE / "mtp.ps1"), "-Operation", operation,
            "-MissionId", MISSION_ID]
    if directory:
        args += ["-Directory", str(directory)]
    if source:
        args += ["-Source", str(source)]
    if expected_hash:
        args += ["-ExpectedHash", expected_hash]
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                            errors="replace", timeout=120, check=False)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip()[-700:] or "Falha no acesso ao RC 2")
    try:
        return json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError("O assistente não recebeu confirmação do RC 2") from exc


def valid_point(value: object) -> bool:
    return (isinstance(value, list) and len(value) == 2
            and all(type(n) in (int, float) and math.isfinite(n) for n in value)
            and abs(value[0]) <= 180 and abs(value[1]) <= 75)


def validate(payload: object) -> dict:
    if not isinstance(payload, dict) or set(payload) != {"plan", "route"}:
        raise ValueError("Pedido de envio inválido")
    plan, route = payload["plan"], payload["route"]
    if not isinstance(plan, dict) or not isinstance(route, list) or not 2 <= len(route) <= 200:
        raise ValueError("A rota precisa ter de 2 a 200 pontos")
    if not all(valid_point(p) for p in route):
        raise ValueError("A rota contém coordenadas inválidas")
    if plan.get("drone") != "DJI Mini 5 Pro" or not isinstance(plan.get("name"), str) or not plan["name"].strip():
        raise ValueError("Selecione DJI Mini 5 Pro e dê um nome à missão")
    if len(plan["name"]) > 120 or not valid_point(plan.get("takeoff")):
        raise ValueError("Nome ou ponto de decolagem H inválido")
    settings = plan.get("settings")
    if not isinstance(settings, dict):
        raise ValueError("Parâmetros da missão ausentes")
    for key, low, high in (("height", 1, 500), ("speed", 0.1, 15), ("gimbal", -90, 0)):
        value = settings.get(key)
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"Parâmetro {key} fora dos limites")
    mode = plan.get("captureMode")
    if mode not in ("manual", "time"):
        raise ValueError("O botão aceita fotos manuais ou por tempo; fotos por distância ainda não foram verificadas")
    interval = plan.get("photoInterval")
    if mode == "time" and (type(interval) not in (int, float) or not math.isfinite(interval) or not 1 <= interval <= 60):
        raise ValueError("Intervalo de fotos precisa estar entre 1 e 60 s")
    if length_m([plan["takeoff"], route[0]]) > 20000 or length_m([route[-1], plan["takeoff"]]) > 20000:
        raise ValueError("A rota está distante demais do ponto H")
    return payload


def transfer(payload: dict) -> dict:
    plan, route = payload["plan"], payload["route"]
    folder = ROOT / (datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + os.urandom(3).hex())
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "plan.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    backup = mtp("backup", folder)
    native = Path(backup["backup"])
    if not native.is_file() or sha256(native) != backup["sha256"]:
        raise RuntimeError("A cópia de segurança do RC 2 não passou na verificação")
    stage = folder / "stage" / f"{MISSION_ID}.kmz"
    metrics = build(native, stage, route, plan["settings"]["height"],
                    plan["settings"]["speed"], plan["settings"]["gimbal"],
                    plan["captureMode"], plan.get("photoInterval", 3))
    result = mtp("replace", folder, stage, backup["sha256"])
    if result.get("sha256") != sha256(stage):
        raise RuntimeError("O arquivo lido de volta do RC 2 difere do KMZ enviado")
    receipt = {"status": "done", "name": plan["name"], "sha256": result["sha256"],
               "backup": str(native), "captureMode": plan["captureMode"],
               "photoInterval": plan.get("photoInterval") if plan["captureMode"] == "time" else None,
               "previous_removed": result["previous_removed"], **metrics}
    (folder / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    logging.info("transfer done folder=%s sha256=%s", folder, receipt["sha256"])
    return receipt


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        logging.info("http " + format, *args)

    def allowed(self) -> bool:
        return (self.headers.get("Origin") in ORIGINS
                and self.headers.get("Host") in {f"127.0.0.1:{PORT}", f"localhost:{PORT}"})

    def reply(self, code: int, value: dict) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        if not self.allowed():
            self.send_error(403)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self.allowed() or self.path != "/health":
            self.send_error(403)
            return
        try:
            status = mtp("status")
            self.reply(200, {"helper": "ready", **status})
        except Exception as exc:
            self.reply(503, {"helper": "ready", "connected": False, "error": str(exc)})

    def do_POST(self) -> None:
        if not self.allowed() or self.path != "/transfer":
            self.send_error(403)
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            self.reply(415, {"error": "Envie JSON"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 200000:
                raise ValueError("Plano ausente ou grande demais")
            payload = validate(json.loads(self.rfile.read(length)))
        except (ValueError, json.JSONDecodeError) as exc:
            self.reply(400, {"error": str(exc)})
            return
        if not LOCK.acquire(blocking=False):
            self.reply(409, {"error": "Já existe uma transferência em andamento"})
            return
        try:
            self.reply(200, transfer(payload))
        except Exception as exc:
            logging.exception("transfer failed")
            self.reply(500, {"error": str(exc)})
        finally:
            LOCK.release()


if __name__ == "__main__":
    logging.info("helper starting port=%s", PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
