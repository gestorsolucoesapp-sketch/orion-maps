"""Recover the local Orion stack after a Windows logon or Docker shutdown."""

import ctypes
import json
import msvcrt
from pathlib import Path
import socket
import subprocess
import time
from datetime import datetime
from urllib.request import urlopen


BASE = Path(r"D:\OrionMaps")
LOG = BASE / "logs" / "orion-watchdog.log"
STATE = BASE / "local-app" / "orion-local-processes.json"
LAUNCHER = BASE / "Iniciar-OrionLocal.ps1"
DOCKER = Path(r"C:\Program Files\Docker\Docker\Docker Desktop.exe")
POWERSHELL = Path(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
CREATE_NO_WINDOW = 0x08000000


def log(message: str) -> None:
    with LOG.open("a", encoding="utf-8") as stream:
        stream.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")


def port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=2):
            return True
    except OSError:
        return False


def http_ok(port: int) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{port}/entrar", timeout=5) as response:
            return response.status == 200
    except Exception:
        return False


def process_running(entry: dict | None) -> bool:
    if not entry or not entry.get("pid"):
        return False
    kernel = ctypes.windll.kernel32
    handle = kernel.OpenProcess(0x1000, False, int(entry["pid"]))
    if not handle:
        return False
    try:
        code = ctypes.c_ulong()
        if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value != 259:
            return False
        class FileTime(ctypes.Structure):
            _fields_ = [("low", ctypes.c_uint32), ("high", ctypes.c_uint32)]
        created, exited, kernel_time, user_time = (FileTime() for _ in range(4))
        if not kernel.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited),
                                      ctypes.byref(kernel_time), ctypes.byref(user_time)):
            return False
        dotnet_ticks = (created.high << 32 | created.low) + 504911232000000000
        return dotnet_ticks == int(entry.get("start_ticks", 0))
    finally:
        kernel.CloseHandle(handle)


def docker_desktop_running() -> bool:
    result = subprocess.run(
        ["tasklist.exe", "/FI", "IMAGENAME eq Docker Desktop.exe", "/FO", "CSV"],
        capture_output=True, text=True, timeout=10, creationflags=CREATE_NO_WINDOW,
    )
    return '"Docker Desktop.exe"' in result.stdout


def launch(mode: str) -> None:
    result = subprocess.run(
        [str(POWERSHELL), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
         "-File", str(LAUNCHER), "-Mode", mode],
        cwd=str(BASE), capture_output=True, text=True, timeout=240,
        creationflags=CREATE_NO_WINDOW,
    )
    if result.returncode:
        raise RuntimeError(f"Orion {mode}: {result.returncode}; {result.stderr[-500:]}")
    log(f"Orion {mode} concluído.")


def main() -> None:
    if not LAUNCHER.exists():
        raise FileNotFoundError(LAUNCHER)
    state = json.loads(STATE.read_text(encoding="utf-8-sig")) if STATE.exists() else {}
    web = process_running(state.get("web"))
    agent = process_running(state.get("agent"))
    if web and agent and port_open(8000) and http_ok(3001) and http_ok(18771):
        return

    if not port_open(8000):
        if not DOCKER.exists():
            raise FileNotFoundError(DOCKER)
        if not docker_desktop_running():
            subprocess.Popen([str(DOCKER)], cwd=str(DOCKER.parent),
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=CREATE_NO_WINDOW)
            log("Docker Desktop iniciado.")
        for _ in range(30):
            if port_open(8000):
                break
            time.sleep(3)
        else:
            raise RuntimeError("Docker não ficou pronto em 90 segundos")

    if not web and not agent:
        log("Web e Agent parados; iniciando Orion.")
        launch("Start")
    elif web and agent:
        if not http_ok(3001):
            log("Web ativo sem resposta; intervenção necessária.")
        if not http_ok(18771):
            launch("EnsureIphone")
    else:
        log("Web e Agent parcialmente ativos; preservados para proteger jobs.")


if __name__ == "__main__":
    lock_path = BASE / "logs" / "orion-watchdog.lock"
    with lock_path.open("a+b") as lock:
        lock.seek(0)
        lock.write(b"0")
        lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise SystemExit(0)
        try:
            main()
        except Exception as exc:
            log(f"Falha: {exc}")
            raise SystemExit(1)
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
