"""Build a DJI Fly KMZ by retaining the RC 2's own mission configuration."""
from __future__ import annotations

import copy
import math
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

KML = "http://www.opengis.net/kml/2.2"
WPML = "http://www.uav.com/wpmz/1.0.2"
NS = {"k": KML, "w": WPML}
ET.register_namespace("", KML)
ET.register_namespace("wpml", WPML)


def required(parent: ET.Element, path: str) -> ET.Element:
    element = parent.find(path, NS)
    if element is None:
        raise ValueError(f"Arquivo DJI sem o elemento {path}")
    return element


def add(parent: ET.Element, key: str, value: object) -> ET.Element:
    element = ET.SubElement(parent, f"{{{WPML}}}{key}")
    element.text = str(value)
    return element


def length_m(route: list[list[float]]) -> float:
    total = 0.0
    for (lon_a, lat_a), (lon_b, lat_b) in zip(route, route[1:]):
        a, b = math.radians(lat_a), math.radians(lat_b)
        da, db = b - a, math.radians(lon_b - lon_a)
        h = math.sin(da / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(db / 2) ** 2
        total += 2 * 6371008.8 * math.asin(min(1.0, math.sqrt(h)))
    return total


def waypoint_sequence(folder: ET.Element) -> list[tuple[int, float, float]] | None:
    """Read explicit waypoint Placemarks without reordering their document positions."""
    marks = folder.findall("k:Placemark", NS)
    if not marks:
        return None
    if not any(mark.find("k:Point", NS) is not None for mark in marks):
        return None  # A mapping template may describe an area instead of waypoints.
    sequence = []
    for mark in marks:
        index = mark.find("w:index", NS)
        coordinates = mark.find("k:Point/k:coordinates", NS)
        if index is None or coordinates is None or not index.text or not coordinates.text:
            raise ValueError("template.kml contém waypoints sem índice ou coordenadas")
        try:
            lon, lat = (float(value) for value in coordinates.text.split(",")[:2])
            sequence.append((int(index.text), lon, lat))
        except ValueError as error:
            raise ValueError("template.kml contém waypoints inválidos") from error
    return sequence


def verify_template_waypoints(template: ET.Element, route: list[list[float]]) -> None:
    folder = template.find(".//k:Folder", NS)
    if folder is None:
        return  # DJI Fly may store only missionConfig in template.kml.
    sequence = waypoint_sequence(folder)
    if sequence is None:
        return
    if len(sequence) != len(route) or any(
        index != expected_index
        or not math.isclose(lon, expected[0], rel_tol=0, abs_tol=1e-10)
        or not math.isclose(lat, expected[1], rel_tol=0, abs_tol=1e-10)
        for expected_index, ((index, lon, lat), expected) in enumerate(zip(sequence, route))
    ):
        raise ValueError(
            "template.kml e waylines.wpml teriam waypoints diferentes; "
            "exportação bloqueada até conferir o KMZ original do DJI Fly"
        )


def validate_capture_ranges(route: list[list[float]], capture_mode: str,
                            capture_ranges: list[dict[str, int]] | None) -> list[tuple[int, int]]:
    if capture_mode == "manual":
        if capture_ranges:
            raise ValueError("Captura manual não deve conter intervalos automáticos")
        return []
    if capture_mode != "time" or not isinstance(capture_ranges, list) or not capture_ranges:
        raise ValueError("Captura automática exige intervalos explícitos de cada faixa")
    result = []
    for item in capture_ranges:
        if not isinstance(item, dict) or set(item) != {"start", "end"}:
            raise ValueError("Intervalo de captura inválido")
        start, end = item["start"], item["end"]
        if (type(start) is not int or type(end) is not int or start < 0
                or start >= end or end >= len(route)
                or (result and start <= result[-1][1])):
            raise ValueError("Intervalo de captura fora de ordem ou dos limites da rota")
        result.append((start, end))
    return result


def build(native_path: Path, output_path: Path, route: list[list[float]],
          height: float, speed: float, gimbal: float,
          capture_mode: str, photo_interval: float,
          capture_ranges: list[dict[str, int]] | None = None) -> dict:
    ranges = validate_capture_ranges(route, capture_mode, capture_ranges)
    with zipfile.ZipFile(native_path) as native:
        if native.testzip() is not None:
            raise ValueError("O KMZ original no RC 2 está danificado")
        template = ET.fromstring(native.read("wpmz/template.kml"))
        waylines = ET.fromstring(native.read("wpmz/waylines.wpml"))

    config = required(template, ".//w:missionConfig")
    if required(config, "w:droneInfo/w:droneEnumValue").text != "68":
        raise ValueError("A missão original não é do perfil DJI Mini 5 Pro esperado")
    folder = required(waylines, ".//k:Folder")
    original = required(folder, "k:Placemark")
    gimbal_group = next((group for group in original.findall("w:actionGroup", NS)
                         if group.find(".//w:actionActuatorFunc", NS) is not None
                         and group.find(".//w:actionActuatorFunc", NS).text == "gimbalRotate"), None)
    if gimbal_group is None:
        raise ValueError("A missão original não contém a ação de gimbal esperada")

    for mark in list(folder.findall("k:Placemark", NS)):
        folder.remove(mark)
    for document in (template, waylines):
        required(document, ".//w:globalTransitionalSpeed").text = str(speed)
        required(document, ".//w:finishAction").text = "goHome"
    now = str(int(time.time() * 1000))
    for key in ("createTime", "updateTime"):
        required(template, f".//w:{key}").text = now
    distance = length_m(route)
    required(folder, "w:autoFlightSpeed").text = str(speed)
    required(folder, "w:distance").text = f"{distance:.1f}"
    required(folder, "w:duration").text = f"{distance / speed:.1f}"

    for index, (lon, lat) in enumerate(route):
        mark = copy.deepcopy(original)
        for group in list(mark.findall("w:actionGroup", NS)):
            mark.remove(group)
        required(mark, "k:Point/k:coordinates").text = f"{lon:.14f},{lat:.14f}"
        required(mark, "w:index").text = str(index)
        required(mark, "w:executeHeight").text = str(height)
        required(mark, "w:waypointSpeed").text = str(speed)
        required(mark, "w:waypointTurnParam/w:waypointTurnMode").text = (
            "toPointAndStopWithContinuityCurvature" if index in (0, len(route) - 1)
            else "toPointAndPassWithContinuityCurvature"
        )
        required(mark, "w:waypointHeadingParam/w:waypointHeadingAngleEnable").text = (
            "1" if index in (0, len(route) - 1) else "0"
        )
        required(mark, "w:waypointGimbalHeadingParam/w:waypointGimbalPitchAngle").text = str(gimbal)
        if index == 0:
            group = copy.deepcopy(gimbal_group)
            required(group, ".//w:gimbalPitchRotateAngle").text = str(gimbal)
            mark.insert(list(mark).index(required(mark, "w:waypointGimbalHeadingParam")), group)
        for range_index, (start, end) in enumerate(ranges):
            if index == start:
                photo_group = ET.SubElement(mark, f"{{{WPML}}}actionGroup")
                for key, value in (("actionGroupId", range_index + 2), ("actionGroupStartIndex", start),
                                   ("actionGroupEndIndex", end),
                                   ("actionGroupMode", "sequence")):
                    add(photo_group, key, value)
                trigger = ET.SubElement(photo_group, f"{{{WPML}}}actionTrigger")
                add(trigger, "actionTriggerType", "multipleTiming")
                add(trigger, "actionTriggerParam", photo_interval)
                action = ET.SubElement(photo_group, f"{{{WPML}}}action")
                add(action, "actionId", range_index + 2)
                add(action, "actionActuatorFunc", "takePhoto")
                param = ET.SubElement(action, f"{{{WPML}}}actionActuatorFuncParam")
                add(param, "payloadPositionIndex", 0)
        folder.append(mark)

    verify_template_waypoints(template, route)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as output:
        output.writestr("wpmz/template.kml", ET.tostring(template, encoding="utf-8", xml_declaration=True))
        output.writestr("wpmz/waylines.wpml", ET.tostring(waylines, encoding="utf-8", xml_declaration=True))
    with zipfile.ZipFile(output_path) as output:
        if output.testzip() is not None:
            raise ValueError("Falha ao verificar o KMZ gerado")
        marks = ET.fromstring(output.read("wpmz/waylines.wpml")).findall(".//k:Folder/k:Placemark", NS)
        if len(marks) != len(route):
            raise ValueError("Quantidade de waypoints divergente no KMZ gerado")
        actual_ranges = []
        for mark in marks:
            for group in mark.findall("w:actionGroup", NS):
                actuator = group.find("w:action/w:actionActuatorFunc", NS)
                if actuator is not None and actuator.text == "takePhoto":
                    if required(group, "w:actionTrigger/w:actionTriggerType").text != "multipleTiming":
                        raise ValueError("Gatilho fotográfico divergente no KMZ gerado")
                    actual_ranges.append((int(required(group, "w:actionGroupStartIndex").text),
                                          int(required(group, "w:actionGroupEndIndex").text)))
        if actual_ranges != ranges:
            raise ValueError("Ação fotográfica divergente no KMZ gerado")
    return {"waypoints": len(route), "distance_m": round(distance, 1),
            "duration_s": round(distance / speed, 1)}
