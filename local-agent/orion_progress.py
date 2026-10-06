"""Progress derived only from ODM output; never extrapolate an overall percent."""
from __future__ import annotations
import math
import re

STAGES = {
    "dataset": "Validando fotografias", "split": "Preparando levantamento",
    "merge": "Preparando blocos", "opensfm": "Alinhando fotografias",
    "openmvs": "Reconstruindo a nuvem densa", "odm_filterpoints": "Filtrando nuvem de pontos",
    "odm_meshing": "Gerando malha 3D", "mvs_texturing": "Texturizando modelo",
    "odm_texturing": "Texturizando modelo", "odm_georeferencing": "Georreferenciando produtos",
    "odm_dem": "Gerando modelos de elevacao", "odm_orthophoto": "Gerando ortomosaico",
    "odm_report": "Gerando relatorio de qualidade", "odm_postprocess": "Otimizando resultados",
}


def choose_concurrency(info: dict, config: dict) -> int:
    """Conservative policy: reserve memory, cap high quality at 2 and others at 4."""
    try:
        memory = float(info.get("availableMemory", 0)) / 1024**3
        cpus = max(1, int(info.get("cpuCores", 1)))
        memory_cap = max(1, int(max(0, memory - 2) // 3)) if math.isfinite(memory) else 1
        quality_cap = 2 if config.get("quality") == "high" else 4
        cap = min(cpus, memory_cap, quality_cap)
        requested = config.get("max_concurrency")
        return min(cap, max(1, int(requested))) if requested is not None else cap
    except (ValueError, TypeError, OverflowError):
        return 1


class NodeODMProgress:
    def __init__(self):
        self.offset = 0
        self.stage = "Alinhando fotografias"
        self.phase = "stage"
        self.pairs: set[tuple[str, str]] = set()
        self.features: set[str] = set()
        self.cameras: set[str] = set()
        self.last_line = ""

    def consume(self, lines: list[str]) -> bool:
        changed = False
        for line in lines:
            self.offset += 1
            if not isinstance(line, str):
                continue
            changed = True
            self.last_line = line[-300:]
            match = re.search(r"Running ([a-z_]+) stage", line, re.I)
            if match:
                self.stage = STAGES.get(match[1].lower(), "Executando " + match[1])
                self.phase = "stage"
            match = re.search(r"Extracting .+ features for image (\S+)", line)
            if match:
                self.features.add(match[1]); self.phase = "features"
            match = re.search(r"Matching (\S+) and (\S+)\.\s+Matcher:", line)
            if match:
                self.pairs.add(tuple(sorted((match[1], match[2])))); self.phase = "matching"
            match = re.search(r"Adding (\S+) to the reconstruction", line)
            if match:
                self.cameras.add(match[1]); self.phase = "reconstruction"
            if "reconstruction" in line.lower() and "images" in line.lower() and "finished" in line.lower():
                self.phase = "stage"
        return changed

    def describe(self, images: int = 0) -> str:
        if self.phase == "features":
            suffix = f" de {images}" if images else ""
            return f"Extraindo pontos visuais - imagem {len(self.features)}{suffix}"
        if self.phase == "matching":
            return f"Correlacionando fotos - {len(self.pairs)} pares comparados"
        if self.phase == "reconstruction":
            return f"Reconstruindo cameras - {len(self.cameras)} fotos adicionadas"
        return self.stage
