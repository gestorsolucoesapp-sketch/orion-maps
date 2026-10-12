"""Synthetic, device-free checks for the local RC 2 KMZ builder."""
from __future__ import annotations

import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rc2-helper"))
from mission import KML, WPML, NS, build  # noqa: E402


def node(parent: ET.Element, namespace: str, name: str, value: object | None = None) -> ET.Element:
    child = ET.SubElement(parent, f"{{{namespace}}}{name}")
    if value is not None:
        child.text = str(value)
    return child


def sample_native(path: Path, template_route: list[list[float]]) -> None:
    def document() -> tuple[ET.Element, ET.Element]:
        root = ET.Element(f"{{{KML}}}kml", {"synthetic": "preserve"})
        doc = node(root, KML, "Document")
        config = node(doc, WPML, "missionConfig")
        node(config, WPML, "globalTransitionalSpeed", 5)
        node(config, WPML, "finishAction", "goHome")
        drone = node(config, WPML, "droneInfo")
        node(drone, WPML, "droneEnumValue", 68)
        return root, doc

    template, template_doc = document()
    node(template_doc, WPML, "createTime", 1)
    node(template_doc, WPML, "updateTime", 1)
    template_folder = node(template_doc, KML, "Folder")
    node(template_folder, WPML, "templateType", "waypoint")
    node(template_folder, WPML, "templateId", 0)
    node(template_folder, WPML, "customMetadata", "retain-me")
    for index, (lon, lat) in enumerate(template_route):
        mark = node(template_folder, KML, "Placemark")
        node(node(mark, KML, "Point"), KML, "coordinates", f"{lon},{lat}")
        node(mark, WPML, "index", index)
        node(mark, WPML, "height", 100)

    waylines, waylines_doc = document()
    folder = node(waylines_doc, KML, "Folder")
    node(folder, WPML, "autoFlightSpeed", 5)
    node(folder, WPML, "distance", 10)
    node(folder, WPML, "duration", 2)
    mark = node(folder, KML, "Placemark")
    node(node(mark, KML, "Point"), KML, "coordinates", "-47,-21")
    node(mark, WPML, "index", 0)
    node(mark, WPML, "executeHeight", 100)
    node(mark, WPML, "waypointSpeed", 5)
    node(node(mark, WPML, "waypointTurnParam"), WPML, "waypointTurnMode", "original")
    node(node(mark, WPML, "waypointHeadingParam"), WPML, "waypointHeadingAngleEnable", 0)
    node(node(mark, WPML, "waypointGimbalHeadingParam"), WPML, "waypointGimbalPitchAngle", -90)
    group = node(mark, WPML, "actionGroup")
    node(group, WPML, "actionGroupId", 1)
    node(group, WPML, "actionGroupStartIndex", 0)
    node(group, WPML, "actionGroupEndIndex", 0)
    action = node(group, WPML, "action")
    node(action, WPML, "actionActuatorFunc", "gimbalRotate")
    params = node(action, WPML, "actionActuatorFuncParam")
    node(params, WPML, "gimbalPitchRotateEnable", 1)
    node(params, WPML, "gimbalPitchRotateAngle", -90)

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as output:
        output.writestr("wpmz/template.kml", ET.tostring(template))
        output.writestr("wpmz/waylines.wpml", ET.tostring(waylines))


def waypoints(xml: bytes) -> list[tuple[int, float, float]]:
    root = ET.fromstring(xml)
    result = []
    for mark in root.findall(".//k:Folder/k:Placemark", NS):
        index = int(mark.find("w:index", NS).text)
        lon, lat = map(float, mark.find("k:Point/k:coordinates", NS).text.split(",")[:2])
        result.append((index, lon, lat))
    return result


class Rc2MissionTest(unittest.TestCase):
    def test_native_template_with_mission_config_only_is_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47, -21], [-47.0001, -21]]
            sample_native(native, route)
            with zipfile.ZipFile(native) as source:
                template = ET.fromstring(source.read("wpmz/template.kml"))
                waylines = source.read("wpmz/waylines.wpml")
            document = template.find("k:Document", NS)
            document.remove(document.find("k:Folder", NS))
            with zipfile.ZipFile(native, "w", zipfile.ZIP_DEFLATED) as changed:
                changed.writestr("wpmz/template.kml", ET.tostring(template))
                changed.writestr("wpmz/waylines.wpml", waylines)
            build(native, output, route, 100, 5, -90, "time", 3,
                  [{"start": 0, "end": 1}])
            self.assertTrue(output.exists())

    def test_different_waypoint_template_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            sample_native(native, [[-47, -21], [-47.0001, -21.0001]])
            route = [[-47 + i * 0.0001, -21 + i * 0.0001] for i in range(12)]
            with self.assertRaisesRegex(ValueError, "template.kml.*waylines.wpml"):
                build(native, output, route, 100, 5, -90, "manual", 3)
            self.assertFalse(output.exists())

    def test_lexicographic_waypoint_order_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47 + i * 0.0001, -21 + i * 0.0001] for i in range(12)]
            sample_native(native, route)
            with zipfile.ZipFile(native) as source:
                template = ET.fromstring(source.read("wpmz/template.kml"))
                waylines = source.read("wpmz/waylines.wpml")
            folder = template.find(".//k:Folder", NS)
            marks = folder.findall("k:Placemark", NS)
            for mark in marks:
                folder.remove(mark)
            for mark in sorted(marks, key=lambda item: item.find("w:index", NS).text):
                folder.append(mark)
            with zipfile.ZipFile(native, "w", zipfile.ZIP_DEFLATED) as output_zip:
                output_zip.writestr("wpmz/template.kml", ET.tostring(template))
                output_zip.writestr("wpmz/waylines.wpml", waylines)
            with self.assertRaisesRegex(ValueError, "template.kml.*waylines.wpml"):
                build(native, output, route, 100, 5, -90, "manual", 3)
            self.assertFalse(output.exists())

    def test_matching_template_keeps_order_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47 + i * 0.0001, -21 + i * 0.0001] for i in range(12)]
            sample_native(native, route)
            build(native, output, route, 100, 5, -90, "manual", 3)
            with zipfile.ZipFile(output) as result:
                template = result.read("wpmz/template.kml")
                waylines = result.read("wpmz/waylines.wpml")
            expected = [(i, lon, lat) for i, (lon, lat) in enumerate(route)]
            for actual in (waypoints(template), waypoints(waylines)):
                self.assertEqual(len(actual), len(expected))
                for (index, lon, lat), (wanted_index, wanted_lon, wanted_lat) in zip(actual, expected):
                    self.assertEqual(index, wanted_index)
                    self.assertAlmostEqual(lon, wanted_lon, places=12)
                    self.assertAlmostEqual(lat, wanted_lat, places=12)
            parsed = ET.fromstring(template)
            self.assertEqual(parsed.attrib["synthetic"], "preserve")
            self.assertEqual(parsed.find(".//w:customMetadata", NS).text, "retain-me")

    def test_one_photo_group_covers_connections_between_capture_legs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47 + i * 0.0001, -21] for i in range(6)]
            sample_native(native, route)
            capture_ranges = [{"start": 0, "end": 5}]
            build(native, output, route, 100, 5, -90, "time", 3, capture_ranges)
            with zipfile.ZipFile(output) as result:
                marks = ET.fromstring(result.read("wpmz/waylines.wpml")).findall(".//k:Folder/k:Placemark", NS)
            groups = [group for mark in marks for group in mark.findall("w:actionGroup", NS)
                      if group.find("w:action/w:actionActuatorFunc", NS).text == "takePhoto"]
            self.assertEqual([(int(group.find("w:actionGroupStartIndex", NS).text),
                               int(group.find("w:actionGroupEndIndex", NS).text)) for group in groups],
                             [(0, 5)])
            self.assertTrue(all(group.find("w:actionTrigger/w:actionTriggerType", NS).text == "multipleTiming"
                                for group in groups))
            gimbal = marks[0].find("w:actionGroup", NS)
            self.assertEqual(gimbal.find("w:action/w:actionActuatorFunc", NS).text, "gimbalRotate")
            self.assertEqual(gimbal.find(".//w:gimbalPitchRotateEnable", NS).text, "1")
            self.assertEqual(gimbal.find(".//w:gimbalPitchRotateAngle", NS).text, "-90")

    def test_manual_mode_keeps_flight_route_without_photo_actions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47, -21], [-47.0001, -21], [-47.0002, -21]]
            sample_native(native, route)
            build(native, output, route, 100, 5, -90, "manual", 3, [])
            with zipfile.ZipFile(output) as result:
                marks = ET.fromstring(result.read("wpmz/waylines.wpml")).findall(
                    ".//k:Folder/k:Placemark", NS)
            self.assertEqual(len(marks), len(route))
            self.assertFalse(any(
                action.find("w:actionActuatorFunc", NS).text == "takePhoto"
                for mark in marks
                for group in mark.findall("w:actionGroup", NS)
                for action in group.findall("w:action", NS)))

    def test_gimbal_and_photo_start_at_first_capture_waypoint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47 + i * 0.0001, -21] for i in range(6)]
            sample_native(native, route)
            build(native, output, route, 100, 5, -90, "time", 3,
                  [{"start": 2, "end": 3}])
            with zipfile.ZipFile(output) as result:
                marks = ET.fromstring(result.read("wpmz/waylines.wpml")).findall(
                    ".//k:Folder/k:Placemark", NS)
            self.assertFalse(marks[0].findall("w:actionGroup", NS))
            groups = marks[2].findall("w:actionGroup", NS)
            self.assertEqual([group.find("w:action/w:actionActuatorFunc", NS).text
                              for group in groups], ["gimbalRotate", "takePhoto"])
            self.assertTrue(all(group.find("w:actionGroupStartIndex", NS).text == "2"
                                for group in groups))

    def test_automatic_photo_without_explicit_legs_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            native, output = Path(directory) / "native.kmz", Path(directory) / "out.kmz"
            route = [[-47, -21], [-47.0001, -21]]
            sample_native(native, route)
            with self.assertRaisesRegex(ValueError, "intervalo contínuo"):
                build(native, output, route, 100, 5, -90, "time", 3)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
