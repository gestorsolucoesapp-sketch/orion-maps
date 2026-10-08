"""Local image intake checks without database or drone hardware."""

import ast
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, UnidentifiedImageError


AGENT = Path(__file__).resolve().parents[1] / "local-agent" / "orion_agent.py"
parsed = ast.parse(AGENT.read_text(encoding="utf-8"), filename=str(AGENT))
functions = [node for node in parsed.body if isinstance(node, ast.FunctionDef)
             and node.name == "inspect_input_images"]
namespace = {"Path": Path, "Image": Image, "UnidentifiedImageError": UnidentifiedImageError,
             "hashlib": hashlib, "Any": object}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(AGENT), "exec"), namespace)
inspect = namespace["inspect_input_images"]


class FakePhoto:
    size = (3000, 2000)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def getexif(self):
        return {34853: 1}

    def verify(self):
        pass


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.photos = []
        for index in range(3):
            path = self.root / f"photo{index}.jpg"
            Image.new("RGB", (16, 16), color=(index * 60, 0, 0)).save(path)
            self.photos.append(path)

    def test_valid_gps_photos_are_counted_without_claiming_accuracy(self):
        with patch.object(Image, "open", return_value=FakePhoto()):
            result = inspect(self.photos)
        self.assertEqual(result["image_count"], 3)
        self.assertEqual(result["gps_tagged_count"], 3)
        self.assertEqual(result["duplicate_count"], 0)
        self.assertIn("não comprova precisão", result["note"])

    def test_ungeotagged_lot_fails_before_processing(self):
        with self.assertRaisesRegex(RuntimeError, "Nenhuma foto tem coordenadas GPS"):
            inspect(self.photos)

    def test_duplicate_or_corrupt_file_fails_before_processing(self):
        self.photos[2].write_bytes(self.photos[1].read_bytes())
        with patch.object(Image, "open", return_value=FakePhoto()):
            with self.assertRaisesRegex(RuntimeError, "fotos duplicadas"):
                inspect(self.photos)
        self.photos[0].write_bytes(b"invalid-jpeg")
        with self.assertRaisesRegex(RuntimeError, "Imagem inválida"):
            inspect(self.photos)


if __name__ == "__main__":
    unittest.main()
