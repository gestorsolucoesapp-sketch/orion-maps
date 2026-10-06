"""Upload regressions with local files and SDK/network stubs; no remote writes."""

import ast
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


AGENT = Path(__file__).resolve().parents[1] / "local-agent" / "orion_agent.py"


class NetworkError(Exception):
    pass


class RemoteProtocolError(Exception):
    pass


class TimeoutException(Exception):
    pass


class StorageError(Exception):
    """The SDK exposes the storage status in its JSON exception arguments."""

    def __init__(self, status):
        self.status = status
        self.response = types.SimpleNamespace(status_code=400)
        super().__init__({"statusCode": status, "message": "SECRET_TOKEN must never be logged"})


def load_upload_functions():
    # Importing the executable agent configures Windows paths and a log file.
    # Compile only the real upload functions to exercise them without that startup.
    parsed = ast.parse(AGENT.read_text(encoding="utf-8"), filename=str(AGENT))
    functions = [node for node in parsed.body if isinstance(node, ast.FunctionDef)
                 and node.name in {"upload_file", "upload_results"}]
    namespace = {
        "Path": Path,
        "json": json,
        "logging": Mock(),
        "time": types.SimpleNamespace(sleep=Mock()),
        "PRODUCTS_BUCKET": "processing-results",
        "update_job": Mock(),
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(AGENT), "exec"), namespace)
    return namespace


class AgentUploadTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.file = self.root / "orthophoto_web.png"
        self.content = b"lossless-product-data"
        self.file.write_bytes(self.content)
        self.bucket = Mock()
        self.sb = Mock()
        self.sb.storage.from_.return_value = self.bucket
        self.sb.storage.get_bucket.return_value = types.SimpleNamespace(file_size_limit=2 * 1024**3)
        self.module = load_upload_functions()
        self.httpx_patch = patch.dict(sys.modules, {"httpx": types.SimpleNamespace(
            NetworkError=NetworkError,
            RemoteProtocolError=RemoteProtocolError,
            TimeoutException=TimeoutException,
        )})
        self.httpx_patch.start()
        self.addCleanup(self.httpx_patch.stop)

    def upload(self, **kwargs):
        return self.module["upload_file"](
            self.sb, self.file, "owner/job/orthophoto/orthophoto_web.png", "image/png", **kwargs
        )

    def paths(self, second=False):
        report = self.root / "relatorio.json"
        report.write_text(json.dumps({"bounds_wgs84": {"west": -47, "east": -46}}), encoding="utf-8")
        paths = {"orthophoto": self.file, "_meta": report}
        if second:
            dtm = self.root / "dtm.tif"
            dtm.write_bytes(b"numeric-elevation-data")
            paths["dtm"] = dtm
        return paths

    def test_stream_is_used_without_reading_entire_file_and_is_closed(self):
        streams = []

        def receive(remote, stream, options):
            streams.append(stream)
            self.assertFalse(stream.closed)
            self.assertEqual(stream.tell(), 0)
            self.assertEqual(stream.read(), self.content)
            self.assertEqual(options["content-type"], "image/png")
            self.assertEqual(options["upsert"], "true")

        self.bucket.upload.side_effect = receive
        with patch.object(Path, "read_bytes", side_effect=AssertionError("must stream")):
            self.upload()
        self.assertTrue(streams[0].closed)
        self.module["time"].sleep.assert_not_called()

    def test_retry_reopens_partially_consumed_stream(self):
        streams = []

        def receive(remote, stream, options):
            streams.append(stream)
            self.assertEqual(stream.tell(), 0)
            if len(streams) == 1:
                stream.read(4)
                raise StorageError(503)
            self.assertEqual(stream.read(), self.content)

        self.bucket.upload.side_effect = receive
        self.upload()
        self.assertEqual(len(streams), 2)
        self.assertIsNot(streams[0], streams[1])
        self.assertTrue(all(stream.closed for stream in streams))
        self.module["time"].sleep.assert_called_once_with(2)
        self.assertNotIn("SECRET_TOKEN", str(self.module["logging"].mock_calls))

    def test_temporary_network_error_has_bounded_retries_and_safe_diagnostic(self):
        self.bucket.upload.side_effect = TimeoutException("https://secret.example?token=SECRET_TOKEN")
        with self.assertRaises(RuntimeError) as caught:
            self.upload(bucket_limit_bytes=2 * 1024**3)
        self.assertEqual(self.bucket.upload.call_count, 3)
        self.assertEqual(self.module["time"].sleep.call_count, 2)
        self.assertTrue(caught.exception.retryable)
        self.assertIsNone(caught.exception.status_code)
        self.assertIn(self.file.name, str(caught.exception))
        self.assertIn(f"{len(self.content)} bytes", str(caught.exception))
        self.assertIn("2147483648 bytes", str(caught.exception))
        self.assertNotIn("SECRET_TOKEN", str(caught.exception))
        self.assertNotIn("secret.example", str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__)

    def test_size_auth_and_permission_errors_are_never_retried(self):
        for code in (413, 401, 403):
            with self.subTest(code=code):
                self.bucket.upload.reset_mock()
                self.module["time"].sleep.reset_mock()
                self.bucket.upload.side_effect = StorageError(code)
                with self.assertRaises(RuntimeError) as caught:
                    self.upload(bucket_limit_bytes=2 * 1024**3)
                self.bucket.upload.assert_called_once()
                self.module["time"].sleep.assert_not_called()
                self.assertEqual(caught.exception.status_code, code)
                self.assertFalse(caught.exception.retryable)
                self.assertIn("limite global do projeto: não verificado", str(caught.exception))
                self.assertNotIn("SECRET_TOKEN", str(caught.exception))

    def test_inner_storage_status_takes_precedence_over_outer_http_status(self):
        error = StorageError(413)
        error.status = 503
        error.response.status_code = 503
        self.bucket.upload.side_effect = error
        with self.assertRaises(RuntimeError) as caught:
            self.upload()
        self.assertEqual(caught.exception.status_code, 413)
        self.bucket.upload.assert_called_once()
        self.module["time"].sleep.assert_not_called()

    def test_known_bucket_limit_rejects_before_network(self):
        with self.assertRaises(RuntimeError) as caught:
            self.upload(bucket_limit_bytes=len(self.content) - 1)
        self.bucket.upload.assert_not_called()
        self.assertIn(self.file.name, str(caught.exception))
        self.assertIn("excede o limite do bucket", str(caught.exception))

    def test_transient_http_errors_retry_but_other_client_errors_do_not(self):
        for code, expected_calls in ((408, 3), (429, 3), (500, 3), (502, 3), (504, 3), (400, 1), (404, 1)):
            with self.subTest(code=code):
                self.bucket.upload.reset_mock()
                self.bucket.upload.side_effect = StorageError(code)
                with self.assertRaises(RuntimeError):
                    self.upload()
                self.assertEqual(self.bucket.upload.call_count, expected_calls)

    def test_results_are_upserted_only_after_success_and_never_deleted(self):
        events = []

        def receive(remote, stream, options):
            events.append(("upload", remote))
            if "dtm" in remote:
                raise StorageError(413)

        table = self.sb.table.return_value
        table.upsert.side_effect = lambda row, **kwargs: (
            events.append(("upsert", row["kind"])) or Mock()
        )
        self.bucket.upload.side_effect = receive
        with self.assertRaises(RuntimeError):
            self.module["upload_results"](self.sb, "owner", "survey", "job", self.paths(second=True))
        table.delete.assert_not_called()
        table.insert.assert_not_called()
        table.upsert.assert_called_once()
        row = table.upsert.call_args.args[0]
        self.assertEqual(row["kind"], "orthophoto")
        self.assertEqual(row["size_bytes"], len(self.content))
        self.assertEqual(table.upsert.call_args.kwargs, {"on_conflict": "job_id,kind,storage_path"})
        self.assertEqual([event[0] for event in events], ["upload", "upsert", "upload"])
        self.sb.storage.get_bucket.assert_called_once_with("processing-results")
        first_status = self.module["update_job"].call_args_list[0].kwargs
        self.assertEqual(first_status["progress"], 88)
        self.assertIn("orthophoto_web.png", first_status["message"])

    def test_repeated_result_upload_uses_same_conflict_identity(self):
        paths = self.paths()
        for _ in range(2):
            self.module["upload_results"](self.sb, "owner", "survey", "job", paths)
        calls = self.sb.table.return_value.upsert.call_args_list
        self.assertEqual(len(calls), 2)
        for key in ("job_id", "kind", "storage_path"):
            self.assertEqual(calls[0].args[0][key], calls[1].args[0][key])
        self.sb.table.return_value.delete.assert_not_called()

    def test_bucket_metadata_permission_failure_does_not_prevent_upload(self):
        self.sb.storage.get_bucket.side_effect = StorageError(403)
        self.module["upload_results"](self.sb, "owner", "survey", "job", self.paths())
        self.bucket.upload.assert_called_once()
        self.sb.table.return_value.upsert.assert_called_once()
        self.assertNotIn("SECRET_TOKEN", str(self.module["logging"].mock_calls))


if __name__ == "__main__":
    unittest.main()
