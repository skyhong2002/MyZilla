#!/usr/bin/env python3
"""Credential-free routine probe, separate from the temporary import monitor."""
import argparse
import datetime
import http.client
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
UTC = datetime.timezone.utc


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(opener, url, timeout, *, health=False, invalid_token=False):
    headers = {'Authorization': 'Bearer myzilla-healthcheck-invalid'} if invalid_token else {}
    request = urllib.request.Request(url, headers=headers)
    try:
        with opener.open(request, timeout=timeout) as response:
            status = response.status
            # Never consume private API bodies, even if authentication regresses.
            if not health:
                return {'status': status, 'ok': False}
            data = json.loads(response.read(4097))
            return {'status': status, 'ok': status == 200 and isinstance(data, dict) and data.get('ok') is True}
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        return {'status': status, 'ok': not health and status == 401}
    except (OSError, ValueError, http.client.HTTPException):
        # No response bodies, URLs, exception strings or credentials in results.
        return {'status': 0, 'ok': False}


def probe(base_url, timeout):
    opener = urllib.request.build_opener(NoRedirect())
    checks = {
        'health': check(opener, base_url + '/health', timeout, health=True),
        'anonymousPrivateApi': check(opener, base_url + '/api/sources', timeout),
        'invalidTokenPrivateApi': check(opener, base_url + '/api/sources', timeout, invalid_token=True),
    }
    return {'at': datetime.datetime.now(UTC).isoformat(),
            'healthy': all(item['ok'] for item in checks.values()), 'checks': checks}


def write_result(path, record):
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.health-', delete=False) as out:
            temporary = Path(out.name)
            json.dump(record, out, indent=2)
            out.write('\n')
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def freshness(path, max_age_seconds, now=None):
    result = {'healthy': False, 'fresh': False, 'maxAgeSeconds': max_age_seconds}
    try:
        record = json.loads(path.read_text())
        at = datetime.datetime.fromisoformat(record['at'])
        age = ((now or datetime.datetime.now(UTC)) - at).total_seconds()
        if not isinstance(record['healthy'], bool):
            raise ValueError('invalid health result')
    except (OSError, ValueError, KeyError, TypeError):
        return {**result, 'reason': 'missing-or-invalid-result'}
    fresh = 0 <= age <= max_age_seconds
    return {**result, 'ageSeconds': age, 'fresh': fresh,
            'healthy': fresh and record['healthy'],
            'reason': ('ok' if record['healthy'] else 'probe-failed') if fresh else 'stale-or-future-result'}


def positive_seconds(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError('must be a finite positive number')
    return number


def base_url(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme not in ('https', 'http') or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment or parsed.path not in ('', '/')
            or (parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'))):
        raise argparse.ArgumentTypeError('use an HTTPS origin without credentials, or loopback HTTP')
    return value.rstrip('/')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', type=base_url, default='https://myzilla.observe.tw')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/health-monitor/latest.json')
    parser.add_argument('--timeout-seconds', type=positive_seconds, default=10)
    parser.add_argument('--check-freshness', action='store_true', help='check saved result without network access')
    parser.add_argument('--max-age-seconds', type=positive_seconds, default=300)
    args = parser.parse_args(argv)
    if args.check_freshness:
        record = freshness(args.output, args.max_age_seconds)
    else:
        record = probe(args.base_url, args.timeout_seconds)
        write_result(args.output, record)
    print(json.dumps(record))
    return 0 if record['healthy'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
