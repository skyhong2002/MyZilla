#!/usr/bin/env python3
"""Read-only, resumable import of every Chromium or Firefox SQLite history row."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid

CHROMIUM_EPOCH_MS = 11644473600000

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def send(server, token, payload):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(server.rstrip('/') + '/api/events', body,
        {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
    for attempt in range(6):
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code < 500 and error.code != 429:
                raise RuntimeError(f'HTTP {error.code}: import stopped; checkpoint preserved') from error
            if attempt == 5: raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 5: raise
        time.sleep(min(2 ** attempt, 20))

def inspect(db):
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if {'visits', 'urls'} <= tables:
        return 'chromium', 'visits', '''SELECT v.id,u.url,u.title,v.visit_time,v.transition
            FROM visits v LEFT JOIN urls u ON u.id=v.url WHERE v.id>? ORDER BY v.id LIMIT ?'''
    if {'moz_historyvisits', 'moz_places'} <= tables:
        return 'firefox', 'moz_historyvisits', '''SELECT v.id,p.url,p.title,v.visit_date,v.visit_type
            FROM moz_historyvisits v LEFT JOIN moz_places p ON p.id=v.place_id WHERE v.id>? ORDER BY v.id LIMIT ?'''
    raise ValueError('Not a Chromium History or Firefox/Zen places.sqlite database')

def row_event(row, engine):
    visit_id, url, title, timestamp, transition = row
    # Null/orphan source rows are retained as an empty URL; never silently filtered.
    return {'kind': 'visit', 'id': f'visit:{visit_id}', 'sourceVisitId': str(visit_id),
            'url': url or '', 'title': title or '',
            'visitedAt': int(timestamp or 0) // 1000 - (CHROMIUM_EPOCH_MS if engine == 'chromium' else 0),
            'transition': str(transition if transition is not None else 'unknown')}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, type=Path, help='Stable copied History/places.sqlite, including committed WAL contents')
    parser.add_argument('--browser', required=True, help='Brave, Arc, Zen, Chrome, Dia, etc.')
    parser.add_argument('--profile', required=True, help='Stable original profile name/path, not snapshot path')
    parser.add_argument('--device', default=socket.gethostname(), help='Stable device name; retain across retries')
    parser.add_argument('--server', default='https://myzilla.observe.tw')
    parser.add_argument('--token-file', type=Path, help='File containing bearer token; otherwise MYZILLA_TOKEN env')
    parser.add_argument('--state-dir', type=Path, default=Path.home() / '.myzilla-import')
    parser.add_argument('--batch-size', type=int, default=200)
    parser.add_argument('--restart', action='store_true', help='Reconcile all rows again; stable IDs deduplicate on server')
    parser.add_argument('--inspect', action='store_true', help='Count rows without uploading')
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 250: parser.error('--batch-size must be 1–250 (no total row limit)')
    from urllib.parse import urlparse
    endpoint = urlparse(args.server)
    if endpoint.scheme != 'https' and not (endpoint.scheme == 'http' and endpoint.hostname in ('localhost', '127.0.0.1', '::1')):
        parser.error('Use HTTPS or loopback HTTP')
    source = {'browser': args.browser, 'profile': args.profile, 'device': args.device, 'method': 'native'}
    identity = json.dumps([args.device, args.browser, args.profile], separators=(',', ':'))
    device_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'myzilla:history:' + identity))
    db = sqlite3.connect(args.db.resolve().as_uri() + '?mode=ro', uri=True)
    db.execute('PRAGMA query_only=ON')
    db.execute('BEGIN')  # consistent snapshot for count and paginated reads
    engine, table, query = inspect(db)
    total = db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
    if args.inspect:
        print(json.dumps({'deviceId': device_id, 'source': source, 'engine': engine, 'sourceRows': total})); return
    token = args.token_file.read_text().strip() if args.token_file else os.environ.get('MYZILLA_TOKEN', '').strip()
    if not token: parser.error('Set MYZILLA_TOKEN or --token-file; token is never printed')
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = hashlib.sha256((args.server.rstrip('/') + device_id).encode()).hexdigest()
    checkpoint = args.state_dir / (key + '.json')
    state = {'lastId': -1, 'processed': 0, 'accepted': 0, 'inserted': 0, 'duplicates': 0, 'rejected': 0}
    if checkpoint.exists() and not args.restart: state = json.loads(checkpoint.read_text())
    while True:
        rows = db.execute(query, (state['lastId'], args.batch_size)).fetchall()
        if not rows: break
        events = [row_event(row, engine) for row in rows]
        response = send(args.server, token, {'deviceId': device_id, 'source': source, 'events': events})
        if response.get('accepted', -1) + response.get('rejected', -1) != len(rows):
            raise RuntimeError('Server counts do not reconcile; checkpoint not advanced')
        if response['rejected']:
            reject_file = args.state_dir / (key + '.rejections.jsonl')
            with reject_file.open('a') as out:
                for rejection in response['rejections']:
                    out.write(json.dumps({'source': source, 'event': events[rejection['index']], 'reason': rejection['reason']}, ensure_ascii=False) + '\n')
            os.chmod(reject_file, 0o600)
            # Do not advance past rejected rows: resolve reason then retry this batch.
            print(json.dumps({'sourceRows': total, 'batch': response, 'rejectionFile': str(reject_file)}), flush=True)
            raise RuntimeError('Rejected rows require attention; no rows silently skipped and checkpoint not advanced')
        state['lastId'] = rows[-1][0]; state['processed'] += len(rows)
        for field in ('accepted', 'inserted', 'duplicates', 'rejected'): state[field] += response[field]
        temporary = checkpoint.with_suffix('.tmp')
        temporary.write_text(json.dumps(state)); os.chmod(temporary, 0o600); temporary.replace(checkpoint)
        print(json.dumps({'sourceRows': total, 'deviceId': device_id, **state}), flush=True)
    print(json.dumps({'complete': True, 'source': source, 'sourceRows': total, 'deviceId': device_id, **state}), flush=True)
    db.close()

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'Import failed: {error}', file=sys.stderr); sys.exit(1)
