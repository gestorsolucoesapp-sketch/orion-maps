"""NodeODM protocol regressions against a local HTTP server, without a real job."""

import ast
import sys
import time as real_time
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "local-agent"))
from orion_progress import NodeODMProgress, choose_concurrency
from orion_runtime import recover_task_id
import json
import logging
import mimetypes
import socket
import tempfile
import threading
import types
import unittest
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest.mock import Mock, patch
from uuid import UUID

import httpx
import requests


SOURCE = Path(__file__).resolve().parents[1] / "local-agent" / "orion_agent.py"
TASK_ID = "00000000-0000-4000-8000-000000000001"


class NodeODMHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        message = BytesParser(policy=policy.default).parsebytes(
            f"Content-Type: {self.headers.get('Content-Type', '')}\r\n\r\n".encode() + body
        )
        parts = list(message.iter_parts()) if message.is_multipart() else []
        self.server.calls.append(self.path)
        if self.path == "/task/new/init":
            # Matches NodeODM's multer().none(): URL encoded forms are not parsed.
            fields = {p.get_param("name", header="content-disposition"):
                      p.get_payload(decode=True).decode() for p in parts}
            self.server.options = json.loads(fields.get("options", "[]"))
            payload = {"uuid": self.server.init_uuid}
        elif self.path.startswith("/task/new/upload/"):
            files = [p for p in parts if p.get_filename()]
            self.server.images.extend((p.get_filename(), p.get_payload(decode=True)) for p in files)
            payload = self.server.upload_reply
        elif self.path.startswith("/task/new/commit/"):
            payload = self.server.commit_reply
        else:
            payload = {"error": "unsupported endpoint"}
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def load_functions(url):
    parsed = ast.parse(SOURCE.read_text(encoding="utf-8"))
    names = {"is_transient_error", "retry_network", "update_job", "nodeodm_json",
             "nodeodm_new_task", "nodeodm_wait", "process_job", "ProcessingCancelled"}
    nodes = [n for n in parsed.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name in names]
    namespace = {"Any": Any, "Path": Path, "UUID": UUID, "json": json,
                 "mimetypes": mimetypes, "socket": socket, "requests": requests,
                 "httpx": httpx, "logging": Mock(spec=logging),
                 "time": types.SimpleNamespace(sleep=Mock(), monotonic=real_time.monotonic), "NODEODM": url,
                 "NodeODMProgress": NodeODMProgress, "choose_concurrency": choose_concurrency, "recover_task_id": recover_task_id,
                 "utcnow": lambda: "2026-10-06T00:00:00+00:00"}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), "exec"), namespace)
    return namespace


class NodeODMProtocolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.images = [root / f"photo-{i}.jpg" for i in range(3)]
        for i, path in enumerate(self.images):
            path.write_bytes(f"original-photo-{i}".encode())
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), NodeODMHandler)
        self.server.calls = []
        self.server.images = []
        self.server.options = []
        self.server.init_uuid = TASK_ID
        self.server.upload_reply = {"success": True}
        self.server.commit_reply = {"uuid": TASK_ID}
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.module = load_functions(f"http://127.0.0.1:{self.server.server_port}")

    def create(self):
        return self.module["nodeodm_new_task"](
            self.images, {"orthophoto_resolution_cm": 3.5, "quality": "high"}
        )

    def test_server_receives_multipart_options_and_each_original_once(self):
        self.assertEqual(self.create(), TASK_ID)
        options = {x["name"]: x["value"] for x in self.server.options}
        self.assertEqual(options["orthophoto-resolution"], 3.5)
        self.assertEqual(options["pc-quality"], "high")
        self.assertEqual(self.server.images, [(p.name, p.read_bytes()) for p in self.images])
        self.assertEqual(self.server.calls.count("/task/new/init"), 1)
        self.assertEqual(self.server.calls[-1], f"/task/new/commit/{TASK_ID}")

    def test_http_200_upload_error_stops_before_commit_without_retry(self):
        self.server.upload_reply = {"error": "disk unavailable"}
        with self.assertRaisesRegex(RuntimeError, "disk unavailable"):
            self.create()
        self.assertEqual(len(self.server.calls), 2)
        self.assertFalse(any("commit" in p for p in self.server.calls))

    def test_missing_upload_acknowledgement_does_not_commit(self):
        self.server.upload_reply = {}
        with self.assertRaisesRegex(RuntimeError, "não confirmou"):
            self.create()
        self.assertEqual(len(self.server.calls), 2)

    def test_commit_error_is_not_converted_to_success(self):
        self.server.commit_reply = {"error": "cannot create task"}
        with self.assertRaisesRegex(RuntimeError, "cannot create task"):
            self.create()
        self.assertEqual(self.server.calls.count(f"/task/new/commit/{TASK_ID}"), 1)

    def test_different_commit_uuid_is_rejected(self):
        self.server.commit_reply = {"uuid": "00000000-0000-4000-8000-000000000002"}
        with self.assertRaisesRegex(RuntimeError, "UUID"):
            self.create()

    def test_invalid_init_uuid_is_rejected_before_upload(self):
        self.server.init_uuid = "../existing-task"
        with self.assertRaisesRegex(RuntimeError, "UUID válido"):
            self.create()
        self.assertEqual(self.server.calls, ["/task/new/init"])

    def test_task_identity_is_reported_before_any_upload_or_commit(self):
        received = []

        def remember(task_id):
            received.append(task_id)
            self.assertEqual(self.server.calls, ["/task/new/init"])

        self.module["nodeodm_new_task"](self.images, {}, on_initialized=remember)
        self.assertEqual(received, [TASK_ID])

    def test_failed_identity_checkpoint_prevents_upload_and_commit(self):
        remember = Mock(side_effect=OSError("checkpoint unavailable"))
        with self.assertRaisesRegex(RuntimeError, "checkpoint unavailable"):
            self.module["nodeodm_new_task"](self.images, {}, on_initialized=remember)
        self.assertEqual(self.server.calls, ["/task/new/init"])

    def test_missing_original_fails_before_creating_a_task(self):
        self.images[0].unlink()
        with self.assertRaisesRegex(RuntimeError, "ausentes ou vazias"):
            self.create()
        self.assertEqual(self.server.calls, [])

    def test_dns_outage_retries_same_status_write_without_new_task(self):
        sb = Mock()
        execute = sb.table.return_value.update.return_value.eq.return_value.execute
        execute.side_effect = [socket.gaierror(11001, "getaddrinfo failed"), None]
        self.module["update_job"](sb, "job", progress=20)
        self.assertEqual(execute.call_count, 2)
        self.module["time"].sleep.assert_called_once_with(5)
        self.assertEqual(self.server.calls, [])

    def test_permission_failure_is_not_retried(self):
        response = requests.Response()
        response.status_code = 403
        operation = Mock(side_effect=requests.HTTPError(response=response))
        with self.assertRaises(requests.HTTPError):
            self.module["retry_network"](operation, "status")
        operation.assert_called_once()
        self.module["time"].sleep.assert_not_called()

    def test_nodeodm_cancelled_exits_polling_instead_of_waiting_forever(self):
        response = Mock()
        response.json.return_value = {"status": {"code": 50}, "progress": 15}
        self.module["update_job"] = Mock(side_effect=socket.gaierror(11001, "getaddrinfo failed"))
        with patch.object(requests, "get", return_value=response):
            with self.assertRaises(self.module["ProcessingCancelled"]):
                self.module["nodeodm_wait"](Mock(), "job", TASK_ID)
        self.module["update_job"].assert_not_called()
        self.module["time"].sleep.assert_not_called()

    def test_directory_failure_keeps_engine_detail_and_read_only_diagnostic(self):
        response = Mock()
        response.json.return_value = {"status": {"code": 30, "errorMessage": "ENOTDIR: images"}, "progress": 0}
        self.module["update_job"] = Mock()
        self.module["nodeodm_directory_diagnostics"] = Mock(return_value='[{"type":"file"}]')
        with patch.object(requests, "get", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "ENOTDIR") as caught:
                self.module["nodeodm_wait"](Mock(), "job", TASK_ID)
        self.assertIn('"type":"file"', str(caught.exception))
        self.assertEqual(self.server.calls, [])


if __name__ == "__main__":
    unittest.main()
