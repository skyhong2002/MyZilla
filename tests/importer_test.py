import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/import_history.py'
spec = importlib.util.spec_from_file_location('importer', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImporterTests(unittest.TestCase):
    def test_all_rows_resume_non_http_and_both_epochs(self):
        received = {}
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.assert_auth = self.headers.get('Authorization') == 'Bearer test-secret'
                if not self.assert_auth: self.send_error(401); return
                data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                inserted = 0
                for event in data['events']:
                    key = (data['deviceId'], event['id'])
                    if key not in received: inserted += 1
                    received[key] = {'event': event, 'source': data['source']}
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(json.dumps({'accepted': len(data['events']), 'inserted': inserted, 'duplicates': len(data['events']) - inserted, 'rejected': 0, 'rejections': []}).encode())
            def log_message(self, *args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp); token = root / 'token'; token.write_text('test-secret')
                for browser, engine in [('Brave', 'chromium'), ('Zen', 'firefox')]:
                    path = root / browser
                    db = sqlite3.connect(path)
                    if engine == 'chromium':
                        db.executescript('CREATE TABLE urls(id INTEGER PRIMARY KEY,url TEXT,title TEXT); CREATE TABLE visits(id INTEGER PRIMARY KEY,url INTEGER,visit_time INTEGER,transition INTEGER);')
                        db.executemany('INSERT INTO urls VALUES(?,?,?)', [(1, 'https://example.org/?q=保留', 'Old title'), (2, 'chrome://settings', 'Internal')])
                        db.executemany('INSERT INTO visits VALUES(?,?,?,?)', [(i, 1 if i % 2 else 2, 11644473600000000 + i * 1000, 1) for i in range(1, 518)])
                    else:
                        db.executescript('CREATE TABLE moz_places(id INTEGER PRIMARY KEY,url TEXT,title TEXT); CREATE TABLE moz_historyvisits(id INTEGER PRIMARY KEY,place_id INTEGER,visit_date INTEGER,visit_type INTEGER);')
                        db.executemany('INSERT INTO moz_places VALUES(?,?,?)', [(1, 'https://example.org/?q=保留', 'Old title'), (2, 'about:config', 'Internal')])
                        db.executemany('INSERT INTO moz_historyvisits VALUES(?,?,?,?)', [(i, 1 if i % 2 else 2, i * 1000, 1) for i in range(1, 518)])
                    db.commit(); db.close()
                    command = ['python3', str(SCRIPT), '--db', str(path), '--browser', browser, '--profile', 'Default', '--device', 'fixture', '--token-file', str(token), '--state-dir', str(root / 'state'), '--server', f'http://127.0.0.1:{server.server_port}', '--batch-size', '37']
                    result = subprocess.run(command, capture_output=True, text=True, check=True)
                    final = json.loads(result.stdout.splitlines()[-1]); self.assertEqual(final['sourceRows'], 517); self.assertEqual(final['accepted'], 517); self.assertEqual(final['rejected'], 0)
                    subprocess.run(command, capture_output=True, check=True)
                    replay = subprocess.run(command + ['--restart'], capture_output=True, text=True, check=True)
                    self.assertEqual(json.loads(replay.stdout.splitlines()[-1])['duplicates'], 517)
                self.assertEqual(len(received), 1034)
                self.assertEqual(sum(value['event']['url'].startswith(('about:', 'chrome:')) for value in received.values()), 516)
                self.assertEqual(min(value['event']['visitedAt'] for value in received.values()), 1)
        finally: server.shutdown(); server.server_close()

if __name__ == '__main__': unittest.main()
