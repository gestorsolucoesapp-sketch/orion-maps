"""Safe, non-destructive cloud copies of large Orion Maps raster outputs.

The photogrammetry originals in the job directory are never modified.
Supabase free-tier global object limit can be below bucket-specific limits.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from PIL import Image

CLOUD_MAX_BYTES = 45 * 1024 * 1024


def prepare_cloud_upload(kind: str, original: Path) -> tuple[Path, str | None, dict]:
    size = original.stat().st_size
    if size <= CLOUD_MAX_BYTES:
        return original, None, {}

    if kind == "orthophoto":
        dest = original.with_suffix(".webp")
        if not dest.is_file() or dest.stat().st_size > CLOUD_MAX_BYTES:
            for quality in (87, 76, 63, 48):
                with Image.open(original) as image:
                    image.save(dest, format="WEBP", quality=quality, alpha_quality=100, method=4)
                if dest.stat().st_size <= CLOUD_MAX_BYTES:
                    break
        if dest.stat().st_size > CLOUD_MAX_BYTES:
            raise RuntimeError("Prévia WEBP permanece grande demais para envio. Original local intacto.")
        with Image.open(original) as source, Image.open(dest) as optimized:
            if optimized.size != source.size or optimized.getbands()[-1] != "A":
                raise RuntimeError("A prévia otimizada perdeu dimensões ou transparência.")
        return dest, "image/webp", {
            "cloud_optimized": True,
            "cloud_compression": "WEBP_87_or_lower",
            "original_size_bytes": size,
            "original_preserved_locally": True,
        }

    if kind == "other":
        original_tif = original.parent / "orthophoto.tif"
        if not original_tif.is_file():
            raise RuntimeError("GeoTIFF original não encontrado; não é permitido alterar COG técnico.")
        dest = original.with_name("orthophoto_cog_cloud.tif")
        if not dest.is_file() or dest.stat().st_size > CLOUD_MAX_BYTES:
            mount = ["docker", "run", "--rm", "-v", str(original.parent) + ":/data",
                     "ghcr.io/osgeo/gdal:ubuntu-full-latest"]
            for quality in (87, 74, 61):
                temp = original.with_name("orthophoto_cog_cloud_tmp.tif")
                if temp.exists():
                    temp.unlink()
                command = mount + [
                    "gdal_translate", "-of", "COG", "-co", "COMPRESS=WEBP",
                    "-co", f"QUALITY={quality}", "-co", "NUM_THREADS=ALL_CPUS",
                    "/data/orthophoto.tif", "/data/orthophoto_cog_cloud_tmp.tif",
                ]
                subprocess.run(command, check=True, timeout=600)
                if temp.stat().st_size <= CLOUD_MAX_BYTES:
                    temp.replace(dest)
                    break
                temp.unlink()
        if not dest.is_file() or dest.stat().st_size > CLOUD_MAX_BYTES:
            raise RuntimeError("COG otimizado excede o limite de envio. Original técnico local preservado.")
        mount = ["docker", "run", "--rm", "-v", str(original.parent) + ":/data",
                 "ghcr.io/osgeo/gdal:ubuntu-full-latest"]
        def info(name: str) -> dict:
            check = subprocess.run(mount + ["gdalinfo", "-json", "/data/" + name],
                                   capture_output=True, text=True, check=True, timeout=180)
            return json.loads(check.stdout)
        original_info = info("orthophoto.tif")
        cloud_info = info(dest.name)
        if original_info.get("size") != cloud_info.get("size") or len(original_info.get("bands", [])) != len(cloud_info.get("bands", [])):
            raise RuntimeError("COG otimizado não preservou resolução ou bandas.")
        orig_geo = original_info.get("geoTransform") or []
        cloud_geo = cloud_info.get("geoTransform") or []
        if len(orig_geo) != 6 or len(cloud_geo) != 6 or any(abs(float(a)-float(b)) > 1e-7 for a,b in zip(orig_geo,cloud_geo)):
            raise RuntimeError("COG otimizado não preservou georreferenciamento.")
        return dest, "image/tiff", {
            "cloud_optimized": True,
            "cloud_compression": "COG_WEBP_lossy",
            "original_size_bytes": size,
            "original_preserved_locally": True,
        }

    raise RuntimeError(f"{kind}: objeto de {size} bytes excede 45 MiB; original local preservado.")
