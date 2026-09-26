#!/usr/bin/env python3
"""One private deployment probe; systemd schedules this until the requested deadline."""
import datetime
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEADLINE = datetime.datetime.fromisoformat('2026-09-27T11:00:00+08:00')

def probe(path, token=None):
    request = urllib.request.Request('https://myzilla.observe.tw' + path,
        headers={'Authorization': 'Bearer ' + token} if token else {})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, {}
    except Exception as error:
        return 0, {'error': str(error)}

def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    directory = ROOT / 'data' / 'monitor'; directory.mkdir(mode=0o700, exist_ok=True)
    token = (ROOT / 'data' / 'client-token').read_text().strip()
    health, _ = probe('/health')
    anonymous, _ = probe('/api/sources')
    authenticated, data = probe('/api/sources', token)
    visits = {}; sources = set()
    for row in data.get('sources', []):
        if row['kind'] != 'visit': continue
        name = row['source']['browser']; visits[name] = visits.get(name, 0) + row['count']; sources.add(row['deviceId'])
    record = {'at': now.isoformat(), 'deadline': DEADLINE.isoformat(), 'health': health,
        'anonymousPrivateApi': anonymous, 'authenticatedPrivateApi': authenticated,
        'healthy': health == 200 and anonymous == 401 and authenticated == 200,
        'visitsByBrowser': visits, 'visitCount': sum(visits.values()), 'nonEmptySources': len(sources),
        'complete': now >= DEADLINE}
    with (directory / 'checks.jsonl').open('a') as out: out.write(json.dumps(record) + '\n')
    (directory / 'latest.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))
    if now >= DEADLINE: subprocess.run(['systemctl', '--user', 'stop', 'myzilla-monitor.timer'], check=True)
    if not record['healthy']: raise SystemExit(1)

if __name__ == '__main__': main()
