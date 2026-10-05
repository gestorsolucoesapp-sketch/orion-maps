from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import keyring
import requests
from supabase import create_client

SUPABASE_URL = "https://zxmhpkcxwlpvkelqapbf.supabase.co"
SUPABASE_KEY = "sb_publishable_Tcg2rXYt-HlQuvIP9jkdog_5CaSBVs-"
SERVICE = "OrionMapsAgent"
NODEODM = os.environ.get("ORION_NODEODM_URL", "http://127.0.0.1:3000").rstrip("/")
ROOT = Path(os.environ.get("ORION_ROOT", r"D:\OrionMaps"))
JOBS = ROOT / "jobs"
LOGS = ROOT / "logs"
PRODUCTS_BUCKET = "processing-results"
IMAGES_BUCKET = "survey-images"
POLL_SECONDS = 15

LOGS.mkdir(parents=True, exist_ok=True)
JOBS.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    filename=LOGS / "agent.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)
console = logging.StreamHandler(sys.stdout)
console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logging.getLogger().addHandler(console)

def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

def run(cmd: list[str], cwd: Path | None = None, capture: bool = False) -> str:
    logging.info("RUN %s", " ".join(cmd))
    p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True, text=True,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None)
    return p.stdout if capture else ""

def docker_ready() -> None:
    try:
        run(["docker", "info"], capture=True)
    except Exception as exc:
        raise RuntimeError("Docker Desktop não está disponível.") from exc
    try:
        run(["docker", "start", "orion-nodeodm"], capture=True)
    except Exception:
        pass
    r = requests.get(f"{NODEODM}/info", timeout=10)
    r.raise_for_status()

def supabase_login():
    email = keyring.get_password(SERVICE, "account")
    if not email:
        raise RuntimeError("Credenciais não configuradas. Execute setup_credentials.py.")
    password = keyring.get_password(SERVICE, email)
    if not password:
        raise RuntimeError("Senha não encontrada no Gerenciador de Credenciais.")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    auth = sb.auth.sign_in_with_password({"email": email, "password": password})
    if not auth.user:
        raise RuntimeError("Falha na autenticação do Orion Maps.")
    return sb, auth.user

def update_job(sb, job_id: str, **values: Any) -> None:
    values["updated_at"] = utcnow()
    values["heartbeat_at"] = utcnow()
    sb.table("processing_jobs").update(values).eq("id", job_id).execute()

def ensure_device(sb, user_id: str) -> str:
    name = platform.node() or "Windows PC"
    token_hash = hashlib.sha256(f"{user_id}:{name}:orion-maps".encode("utf-8")).hexdigest()
    rows = sb.table("processing_devices").select("id").eq("user_id", user_id).eq("name", name).limit(1).execute().data or []
    capabilities = {"nodeodm": True, "pdal": True, "gdal": True, "platform": platform.platform(), "root": str(ROOT)}
    if rows:
        device_id = rows[0]["id"]
        sb.table("processing_devices").update({"enabled": True, "capabilities": capabilities, "last_seen": utcnow()}).eq("id", device_id).execute()
        return str(device_id)
    row = sb.table("processing_devices").insert({"user_id": user_id, "name": name, "token_hash": token_hash, "enabled": True, "capabilities": capabilities, "last_seen": utcnow()}).execute().data
    if not row:
        raise RuntimeError("Não foi possível registrar o processador local.")
    return str(row[0]["id"])

def claim_job(sb, device_id: str):
    result = sb.rpc("claim_my_processing_job", {}).execute()
    data = result.data or []
    if not data:
        return None
    job = data[0]
    sb.table("processing_jobs").update({"device_id": device_id, "heartbeat_at": utcnow(), "updated_at": utcnow()}).eq("id", job["id"]).execute()
    job["device_id"] = device_id
    return job

def list_images(sb, user_id: str, survey_id: str):
    prefix = f"{user_id}/{survey_id}"
    rows = sb.storage.from_(IMAGES_BUCKET).list(prefix, {"limit": 1000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}})
    return [r for r in rows if getattr(r, "name", None) or (isinstance(r, dict) and r.get("name"))]

def item_name(item: Any) -> str:
    if isinstance(item, dict):
        return str(item["name"])
    return str(item.name)

def download_images(sb, user_id: str, survey_id: str, dest: Path, job_id: str) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    items = list_images(sb, user_id, survey_id)
    if len(items) < 3:
        raise RuntimeError("O levantamento tem menos de 3 imagens disponíveis.")
    files: list[Path] = []
    for i, item in enumerate(items, 1):
        name = item_name(item)
        remote = f"{user_id}/{survey_id}/{name}"
        local = dest / name
        if not local.exists() or local.stat().st_size == 0:
            data = sb.storage.from_(IMAGES_BUCKET).download(remote)
            local.write_bytes(data)
        files.append(local)
        if i % 5 == 0 or i == len(items):
            update_job(sb, job_id, status="downloading", stage="downloading",
                       progress=min(18, 2 + round(i / len(items) * 16)),
                       message=f"Baixando imagens: {i}/{len(items)}")
    return files

def nodeodm_new_task(images: list[Path], config: dict[str, Any]) -> str:
    resolution = float(config.get("orthophoto_resolution_cm", 5))
    quality = str(config.get("quality", "balanced"))
    options = [
        {"name": "orthophoto-resolution", "value": resolution},
        {"name": "max-concurrency", "value": 1},
        {"name": "pc-quality", "value": "high" if quality == "high" else "medium"},
    ]
    handles = [open(p, "rb") for p in images]
    try:
        files = [("images", (p.name, h, "image/jpeg")) for p, h in zip(images, handles)]
        r = requests.post(f"{NODEODM}/task/new", files=files,
                          data={"options": json.dumps(options)}, timeout=60 * 60)
        r.raise_for_status()
        payload = r.json()
        uuid = payload.get("uuid") or payload.get("id")
        if not uuid:
            raise RuntimeError(f"NodeODM não retornou UUID: {payload}")
        return str(uuid)
    finally:
        for h in handles:
            h.close()

def nodeodm_wait(sb, job_id: str, task_id: str) -> None:
    while True:
        r = requests.get(f"{NODEODM}/task/{task_id}/info", timeout=30)
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if isinstance(status, dict):
            code = status.get("code")
            status_name = str(status.get("name", "processing"))
        else:
            code = status
            status_name = str(status)
        progress = data.get("progress", 0)
        if isinstance(progress, dict):
            progress = progress.get("progress", 0)
        try:
            pct = float(progress)
        except Exception:
            pct = 0.0
        mapped = min(70, 20 + round(max(0.0, min(100.0, pct)) * 0.5))
        update_job(sb, job_id, status="processing", stage="nodeodm",
                   progress=mapped, engine_task_uuid=task_id,
                   message=f"NodeODM: {status_name} · {pct:.0f}%")
        if code in (40, "40", "COMPLETED", "completed"):
            return
        if code in (30, "30", "FAILED", "failed", "ERROR", "error"):
            raise RuntimeError(f"NodeODM terminou com erro: {data}")
        time.sleep(10)

def nodeodm_download(task_id: str, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / "all.zip"
    with requests.get(f"{NODEODM}/task/{task_id}/download/all.zip", stream=True, timeout=60 * 30) as r:
        r.raise_for_status()
        with open(archive, "wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)
    with zipfile.ZipFile(archive) as z:
        z.extractall(dest / "odm")
    return dest / "odm"

def find_one(root: Path, patterns: list[str]) -> Path:
    for pat in patterns:
        hits = list(root.rglob(pat))
        if hits:
            return hits[0]
    raise FileNotFoundError(f"Arquivo não encontrado: {patterns}")

def docker_path(p: Path, mount: Path) -> str:
    return "/data/" + p.relative_to(mount).as_posix()

def write_pipeline(path: Path, stages: list[dict[str, Any]]) -> None:
    path.write_text(json.dumps({"pipeline": stages}, indent=2), encoding="utf-8")

def pdal_pipeline(products: Path, stages: list[dict[str, Any]], name: str) -> None:
    p = products / name
    write_pipeline(p, stages)
    run(["docker", "run", "--rm", "-v", f"{products}:/data", "pdal/pdal:latest",
         "pdal", "pipeline", f"/data/{name}"])

def make_derivatives(sb, job_id: str, odm: Path, products: Path, config: dict[str, Any]) -> dict[str, Path]:
    products.mkdir(parents=True, exist_ok=True)
    web = products / "web"
    web.mkdir(exist_ok=True)
    ortho_src = find_one(odm, ["odm_orthophoto.tif"])
    laz_src = find_one(odm, ["odm_georeferenced_model.laz", "*.laz"])

    ortho = products / "orthophoto.tif"
    cloud = products / "source_cloud.laz"
    shutil.copy2(ortho_src, ortho)
    shutil.copy2(laz_src, cloud)

    update_job(sb, job_id, status="derivatives", stage="classifying_ground", progress=72,
               message="Classificando terreno com PDAL.")

    pdal_pipeline(products, [
        {"type": "readers.las", "filename": "/data/source_cloud.laz"},
        {"type": "filters.smrf"},
        {"type": "writers.las", "filename": "/data/ground_classified.laz", "compression": "laszip"},
    ], "ground.json")

    update_job(sb, job_id, status="derivatives", stage="elevation_models", progress=76,
               message="Gerando DSM e DTM.")

    pdal_pipeline(products, [
        {"type": "readers.las", "filename": "/data/source_cloud.laz"},
        {"type": "writers.gdal", "filename": "/data/dsm.tif", "resolution": 0.20,
         "output_type": "max", "nodata": -9999},
    ], "dsm.json")

    pdal_pipeline(products, [
        {"type": "readers.las", "filename": "/data/ground_classified.laz"},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": "/data/dtm.tif", "resolution": 0.20,
         "output_type": "idw", "nodata": -9999},
    ], "dtm.json")

    update_job(sb, job_id, status="derivatives", stage="cartography", progress=81,
               message="Gerando curvas, relevo, declividade e hipsometria.")

    gdal = "ghcr.io/osgeo/gdal:ubuntu-full-latest"
    mount = ["docker", "run", "--rm", "-v", f"{products}:/data", gdal]

    run(mount + ["gdal_contour", "-a", "elev", "-i", "0.5", "/data/dtm.tif", "/data/curvas_050m.gpkg"])
    run(mount + ["gdaldem", "hillshade", "/data/dtm.tif", "/data/hillshade.tif", "-compute_edges"])
    run(mount + ["gdaldem", "slope", "/data/dtm.tif", "/data/slope_pct.tif", "-p", "-compute_edges"])

    info_raw = run(mount + ["gdalinfo", "-json", "-stats", "/data/dtm.tif"], capture=True)
    info = json.loads(info_raw)
    md = ((info.get("bands") or [{}])[0].get("metadata") or {}).get("", {})
    zmin = float(md.get("STATISTICS_MINIMUM", 0))
    zmax = float(md.get("STATISTICS_MAXIMUM", 1))
    if not zmax > zmin:
        zmin, zmax = 0.0, 1.0

    colors = products / "cores.txt"
    steps = [
        (0.00, "25 100 45"),
        (0.20, "55 140 55"),
        (0.40, "110 170 65"),
        (0.60, "200 195 70"),
        (0.80, "220 145 60"),
        (0.95, "155 95 55"),
        (1.00, "235 225 200"),
    ]
    colors.write_text("\n".join(f"{zmin + (zmax-zmin)*f:.2f} {rgb}" for f, rgb in steps) + "\nnv 0 0 0 0\n", encoding="utf-8")
    run(mount + ["gdaldem", "color-relief", "/data/dtm.tif", "/data/cores.txt", "/data/hipsometria.tif", "-alpha"])

    # Preserve the orthophoto mask/NoData as alpha so empty pixels stay transparent
    # over the basemap instead of becoming black/white blocks when zooming.
    run(mount + ["gdalwarp", "-t_srs", "EPSG:4326", "-r", "bilinear", "-dstalpha", "/data/orthophoto.tif", "/data/web/orthophoto_4326.tif"])
    run(mount + ["gdal_translate", "-of", "PNG", "/data/web/orthophoto_4326.tif", "/data/web/orthophoto_web.png"])
    for src, dst in [("hillshade.tif","hillshade_web.png"),("hipsometria.tif","hipsometria_web.png"),("slope_pct.tif","slope_web.png")]:
        stem = src.replace(".tif","_4326.tif")
        run(mount + ["gdalwarp", "-t_srs", "EPSG:4326", "-r", "bilinear", f"/data/{src}", f"/data/web/{stem}"])
        run(mount + ["gdal_translate", "-of", "PNG", f"/data/web/{stem}", f"/data/web/{dst}"])
    run(mount + ["ogr2ogr", "-f", "GeoJSON", "-t_srs", "EPSG:4326", "/data/web/curvas_050m.geojson", "/data/curvas_050m.gpkg"])

    web_info = json.loads(run(mount + ["gdalinfo", "-json", "/data/web/orthophoto_4326.tif"], capture=True))
    cc = web_info.get("cornerCoordinates") or {}
    ul, lr = cc.get("upperLeft"), cc.get("lowerRight")
    bounds = None
    if ul and lr:
        bounds = {"west": float(ul[0]), "north": float(ul[1]), "east": float(lr[0]), "south": float(lr[1])}

    cloud_web = products / "ground_web.laz"
    for cell in (0.10, 0.15, 0.20, 0.30, 0.50):
        pdal_pipeline(products, [
            {"type": "readers.las", "filename": "/data/ground_classified.laz"},
            {"type": "filters.voxelcenternearestneighbor", "cell": cell},
            {"type": "writers.las", "filename": "/data/ground_web.laz", "compression": "laszip"},
        ], "cloud_web.json")
        if cloud_web.stat().st_size < 48 * 1024 * 1024:
            break
    if cloud_web.stat().st_size >= 48 * 1024 * 1024:
        raise RuntimeError("A nuvem de pontos web permaneceu acima de 48 MB.")

    report = products / "relatorio.json"
    report.write_text(json.dumps({
        "generated_at": utcnow(),
        "altitude_min_m": round(zmin, 3),
        "altitude_max_m": round(zmax, 3),
        "elevation_range_m": round(zmax-zmin, 3),
        "source_crs": "EPSG:32723",
        "bounds_wgs84": bounds,
        "contour_interval_m": 0.5,
        "notice": "Produtos derivados por fotogrametria. DTM em vegetação é uma estimativa e requer validação para uso topográfico/legal."
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "orthophoto": web / "orthophoto_web.png",
        "hillshade": web / "hillshade_web.png",
        "hypsometry": web / "hipsometria_web.png",
        "slope": web / "slope_web.png",
        "contours": web / "curvas_050m.geojson",
        "dtm": products / "dtm.tif",
        "dsm": products / "dsm.tif",
        "point_cloud": cloud_web,
        "report": report,
        "_meta": products / "relatorio.json",
    }

def upload_file(sb, local: Path, remote: str, content_type: str) -> None:
    data = local.read_bytes()
    sb.storage.from_(PRODUCTS_BUCKET).upload(
        remote,
        data,
        {"content-type": content_type, "upsert": "true", "cache-control": "3600"},
    )

def upload_results(sb, user_id: str, survey_id: str, job_id: str, paths: dict[str, Path]) -> None:
    meta = json.loads(paths["_meta"].read_text(encoding="utf-8"))
    bounds = meta.get("bounds_wgs84")
    base_meta = {
        "altitude_min_m": meta.get("altitude_min_m"),
        "altitude_max_m": meta.get("altitude_max_m"),
        "elevation_range_m": meta.get("elevation_range_m"),
        "bounds_wgs84": bounds,
        "preview_crs": "EPSG:4326",
    }
    specs = {
        "orthophoto": ("Ortofoto", "image/png", True),
        "hillshade": ("Relevo sombreado", "image/png", True),
        "hypsometry": ("Hipsometria", "image/png", True),
        "slope": ("Declividade", "image/png", True),
        "contours": ("Curvas de nível 0,50 m", "application/geo+json", True),
        "dtm": ("DTM", "image/tiff", False),
        "dsm": ("DSM", "image/tiff", False),
        "point_cloud": ("Nuvem de pontos - visualização web", "application/octet-stream", False),
        "report": ("Relatório do processamento", "application/json", False),
    }
    sb.table("processing_results").delete().eq("job_id", job_id).execute()
    kinds = [k for k in specs if k in paths]
    for i, kind in enumerate(kinds, 1):
        local = paths[kind]
        label, mime, preview = specs[kind]
        remote = f"{user_id}/{job_id}/{kind}/{local.name}"
        upload_file(sb, local, remote, mime)
        row_meta = dict(base_meta)
        if kind == "contours":
            row_meta["contour_interval_m"] = 0.5
        if kind == "point_cloud":
            row_meta.update({"format": "LAZ", "classified": True, "web_optimized": True})
        row = {
            "job_id": job_id,
            "owner_id": user_id,
            "survey_id": survey_id,
            "kind": kind,
            "display_name": label,
            "storage_path": remote,
            "web_preview_path": remote if preview else None,
            "mime_type": mime,
            "size_bytes": local.stat().st_size,
            "source_crs": "EPSG:32723",
            "bounds_wgs84": bounds,
            "metadata": row_meta,
        }
        sb.table("processing_results").insert(row).execute()
        update_job(sb, job_id, status="uploading", stage="uploading",
                   progress=min(98, 88 + round(i / len(kinds) * 10)),
                   message=f"Enviando resultados: {i}/{len(kinds)}")

def process_job(sb, user, job: dict[str, Any]) -> None:
    job_id = str(job["id"])
    survey_id = str(job["survey_id"])
    config = job.get("config") or {}
    root = JOBS / job_id
    images_dir = root / "images"
    node_dir = root / "nodeodm"
    products = root / "products"
    root.mkdir(parents=True, exist_ok=True)

    try:
        docker_ready()
        update_job(sb, job_id, status="downloading", stage="downloading", progress=2,
                   started_at=utcnow(), message="Preparando arquivos do levantamento.")
        images = download_images(sb, user.id, survey_id, images_dir, job_id)

        update_job(sb, job_id, status="validating", stage="validating", progress=19,
                   message=f"{len(images)} imagens disponíveis. Preparando NodeODM.")
        task_id = nodeodm_new_task(images, config)
        update_job(sb, job_id, status="processing", stage="nodeodm", progress=20,
                   engine_task_uuid=task_id, message="Tarefa criada no NodeODM.")
        nodeodm_wait(sb, job_id, task_id)

        update_job(sb, job_id, status="derivatives", stage="downloading_odm", progress=71,
                   message="Baixando produtos-base do NodeODM.")
        odm = nodeodm_download(task_id, node_dir)
        paths = make_derivatives(sb, job_id, odm, products, config)

        update_job(sb, job_id, status="uploading", stage="uploading", progress=88,
                   message="Enviando produtos para o Orion Maps.")
        upload_results(sb, user.id, survey_id, job_id, paths)

        update_job(sb, job_id, status="completed", stage="completed", progress=100,
                   completed_at=utcnow(), message=f"Processamento concluído em {products}")
        logging.info("JOB %s concluído", job_id)
    except Exception as exc:
        logging.exception("JOB %s falhou", job_id)
        try:
            update_job(sb, job_id, status="error", stage="error",
                       message="O processamento local encontrou um erro.",
                       error_detail=str(exc)[:5000])
        except Exception:
            logging.exception("Falha ao registrar erro do job.")
        raise

def main() -> None:
    logging.info("Orion Maps Agent iniciado em %s", ROOT)
    while True:
        try:
            sb, user = supabase_login()
            device_id = ensure_device(sb, user.id)
            job = claim_job(sb, device_id)
            if job:
                logging.info("Job recebido: %s", job.get("id"))
                try:
                    process_job(sb, user, job)
                except Exception:
                    pass
            else:
                time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            logging.info("Agente encerrado.")
            return
        except Exception:
            logging.exception("Falha no ciclo do agente.")
            time.sleep(30)

if __name__ == "__main__":
    main()
