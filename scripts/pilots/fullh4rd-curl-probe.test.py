"""Verifica límites de la prueba sin contactar la tienda."""

import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "probe", Path(__file__).with_name("fullh4rd-curl-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Session:
    def __init__(self, responses):
        self.responses = responses
        self.cookies = []
        self.urls = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def get(self, url, **options):
        self.urls.append(url)
        status, headers, body = self.responses.pop(0)
        options["content_callback"](body)
        return type("Response", (), {"status_code": status, "headers": headers})()


class ProbeTest(unittest.TestCase):
    def run_probe(self, responses, limit=6, budget=8, max_bytes=8 * 1024 * 1024):
        session = Session(responses)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "run"
            with patch.object(probe.requests, "Session", return_value=session), \
                    patch.object(probe.time, "sleep"), \
                    patch.object(probe, "MAX_REQUESTS", budget), \
                    patch.object(probe, "MAX_BYTES", max_bytes), redirect_stdout(io.StringIO()):
                code = probe.probe(output, limit)
            receipt = json.loads((output / "receipt.json").read_text())
            self.assertEqual((output / "receipt.json").stat().st_mode & 0o777, 0o600)
        return code, receipt, session.urls

    def test_blocked_stops_before_other_products(self):
        for status in [403, 429]:
            code, receipt, urls = self.run_probe([(status, {}, b"blocked")])
            self.assertEqual(code, 2)
            self.assertEqual(receipt["stopReason"], "blocked")
            self.assertEqual(len(urls), 1)

    def test_challenge_200_is_not_a_product(self):
        _, receipt, urls = self.run_probe([
            (200, {"Content-Type": "text/html"}, b"<title>Just a moment...</title>")])
        self.assertEqual(receipt["stopReason"], "blocked")
        self.assertEqual(len(urls), 1)

    def test_external_redirect_never_requested(self):
        _, receipt, urls = self.run_probe([
            (302, {"Location": "https://example.com/private"}, b"")])
        self.assertEqual(receipt["stopReason"], "disallowed-redirect")
        self.assertEqual(len(urls), 1)
        self.assertFalse(probe.allowed("https://fullh4rd.com.ar@evil.example/"))
        self.assertFalse(probe.allowed("http://fullh4rd.com.ar/"))

    def test_budget_bounds_successful_requests(self):
        _, receipt, urls = self.run_probe([
            (200, {"Content-Type": "text/html"}, b"<h1>producto</h1>")], budget=1)
        self.assertEqual(receipt["stopReason"], "request-budget")
        self.assertEqual(len(urls), 1)

    def test_size_limit_does_not_save_partial_html(self):
        _, receipt, urls = self.run_probe([(200, {}, b"too large")], max_bytes=3)
        self.assertEqual(receipt["stopReason"], "transport-error")
        self.assertEqual(receipt["requests"][0]["errorType"], "ValueError")
        self.assertNotIn("bodyFile", receipt["requests"][0])
        self.assertEqual(len(urls), 1)


if __name__ == "__main__":
    unittest.main()
