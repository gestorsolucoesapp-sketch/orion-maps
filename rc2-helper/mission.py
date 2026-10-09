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


def build(native_path: Path, output_path: Path, route: list[list[float]],
          height: float, speed: float, gimbal: float,
          capture_mode: str, photo_interval: float) -> dict:
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
            if capture_mode == "time":
                photo_group = ET.SubElement(mark, f"{{{WPML}}}actionGroup")
                for key, value in (("actionGroupId", 2), ("actionGroupStartIndex", 0),
                                   ("actionGroupEndIndex", len(route) - 1),
                                   ("actionGroupMode", "sequence")):
                    add(photo_group, key, value)
                trigger = ET.SubElement(photo_group, f"{{{WPML}}}actionTrigger")
                add(trigger, "actionTriggerType", "multipleTiming")
                add(trigger, "actionTriggerParam", photo_interval)
                action = ET.SubElement(photo_group, f"{{{WPML}}}action")
                add(action, "actionId", 2)
                add(action, "actionActuatorFunc", "takePhoto")
                param = ET.SubElement(action, f"{{{WPML}}}actionActuatorFuncParam")
                add(param, "payloadPositionIndex", 0)
        folder.append(mark)

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
        triggers = [node.text for node in ET.fromstring(output.read("wpmz/waylines.wpml")).findall(".//w:actionTriggerType", NS)]
        if ("multipleTiming" in triggers) != (capture_mode == "time"):
            raise ValueError("Ação fotográfica divergente no KMZ gerado")
    return {"waypoints": len(route), "distance_m": round(distance, 1),
            "duration_s": round(distance / speed, 1)}
