import contextlib
import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock
import urllib.error

spec = importlib.util.spec_from_file_location('health_monitor', Path(__file__).parents[1] / 'scripts/health_monitor.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class Handler(BaseHTTPRequestHandler):
    health_body = b'{"ok":true}'
    health_status = 200
    api_status = 401
    seen = []

    def do_GET(self):
        self.seen.append((self.path, self.headers.get('Authorization')))
        health = self.path == '/health'
        self.send_response(self.health_status if health else self.api_status)
        if (self.health_status if health else self.api_status) == 302:
            self.send_header('Location', '/health')
        self.end_headers()
        self.wfile.write(self.health_body if health else b'{"error":"fixture"}')

    def log_message(self, *args):
        pass


class ProbeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        Handler.health_body = b'{"ok":true}'
        Handler.health_status = 200
        Handler.api_status = 401
        Handler.seen = []

    def test_healthy_cli_writes_private_result_and_checks_freshness_without_network(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            path = Path(directory) / 'monitor/latest.json'
            args = ['--output', str(path)]
            self.assertEqual(monitor.main(args + ['--base-url', self.url]), 0)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            record = json.loads(path.read_text())
            self.assertTrue(record['healthy'])
            self.assertNotIn('deadline', record)
            self.assertEqual(Handler.seen, [('/health', None), ('/api/sources', None),
                                          ('/api/sources', 'Bearer myzilla-healthcheck-invalid')])
            Handler.seen = []
            self.assertEqual(monitor.main(args + ['--check-freshness', '--max-age-seconds', '60']), 0)
            self.assertEqual(Handler.seen, [])

    def test_auth_regressions_edge_blocks_and_redirects_fail(self):
        for status in (200, 302, 403, 500):
            with self.subTest(status=status):
                Handler.api_status = status
                record = monitor.probe(self.url, 2)
                self.assertFalse(record['healthy'])
                self.assertEqual(record['checks']['anonymousPrivateApi']['status'], status)

    def test_health_requires_ok_true_and_no_redirect(self):
        for body in (b'{"ok":false}', b'{"ok":1}', b'[]', b'<html>login</html>', b'x' * 5000):
            with self.subTest(body=body[:20]):
                Handler.health_body = body
                self.assertFalse(monitor.probe(self.url, 2)['healthy'])
        Handler.health_status = 302
        self.assertFalse(monitor.probe(self.url, 2)['healthy'])
        Handler.health_body = b'{"ok":true}'
        Handler.health_status = 500
        self.assertFalse(monitor.probe(self.url, 2)['healthy'])

    def test_private_body_is_never_consumed_even_when_api_allows_access(self):
        opener = Mock()
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        opener.open.return_value = response
        self.assertFalse(monitor.check(opener, 'http://fixture/api/sources', 2)['ok'])
        response.read.assert_not_called()

    def test_network_errors_fail_closed_without_logging_details(self):
        opener = Mock()
        for error in (urllib.error.URLError('private detail'), TimeoutError('private detail')):
            with self.subTest(error=type(error).__name__):
                opener.open.side_effect = error
                result = monitor.check(opener, 'http://fixture/health', 1, health=True)
                self.assertEqual(result, {'status': 0, 'ok': False})


class FreshnessTest(unittest.TestCase):
    def test_freshness_boundary_failures_future_and_configurable_threshold(self):
        now = datetime.datetime(2026, 10, 18, tzinfo=datetime.timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'latest.json'
            self.assertFalse(monitor.freshness(path, 300, now)['healthy'])
            for age, healthy, expected in ((300, True, True), (301, True, False),
                                           (-1, True, False), (0, False, False)):
                with self.subTest(age=age, healthy=healthy):
                    monitor.write_result(path, {'at': (now - datetime.timedelta(seconds=age)).isoformat(),
                                                'healthy': healthy})
                    self.assertEqual(monitor.freshness(path, 300, now)['healthy'], expected)
            monitor.write_result(path, {'at': (now - datetime.timedelta(seconds=301)).isoformat(), 'healthy': True})
            self.assertTrue(monitor.freshness(path, 600, now)['healthy'])
            for invalid in ('not json', '[]', '{"at":"2026-10-18T00:00:00","healthy":true}',
                            '{"at":"2026-10-18T00:00:00+00:00","healthy":"true"}'):
                path.write_text(invalid)
                self.assertFalse(monitor.freshness(path, 300, now)['healthy'])

    def test_cli_returns_nonzero_for_stale_and_failed_results(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            path = Path(directory) / 'latest.json'
            args = ['--output', str(path), '--check-freshness']
            self.assertEqual(monitor.main(args), 1)
            monitor.write_result(path, {'at': '2026-09-27T11:00:00+08:00', 'healthy': True})
            self.assertEqual(monitor.main(args), 1)
            monitor.write_result(path, {'at': datetime.datetime.now(monitor.UTC).isoformat(), 'healthy': False})
            self.assertEqual(monitor.main(args), 1)

    def test_cli_rejects_unbounded_timeouts_and_credentials_in_origin(self):
        for value in ('0', '-1', 'nan', 'inf'):
            with self.subTest(value=value), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    monitor.main(['--timeout-seconds', value])
                self.assertEqual(error.exception.code, 2)
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                monitor.main(['--base-url', 'https://user:secret@fixture'])
            self.assertEqual(error.exception.code, 2)


if __name__ == '__main__':
    unittest.main()
