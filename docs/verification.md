# Verification record — 2026-09-27

Production origin: `127.0.0.1:18140`, HTTPS: `https://myzilla.observe.tw`.

## Real imported data

14 Mac source snapshots (11 non-empty, 3 empty), **100,661 visits**:

| Browser | Visits |
| --- | ---: |
| Brave | 9,149 |
| Arc | 45,975 |
| Chrome | 9,127 |
| Dia | 35,474 |
| Zen | 936 |

All 84 non-HTTP rows are retained. Independent Mac-side reconciliation compares SHA256 of ID, sourceVisitId, URL, title, timestamp and transition, plus browser/profile/device/method provenance. It passed for every snapshot and was rerun successfully on the deployment host using the supplied private evidence files. Full replay reported 100,661 duplicates, 0 inserted, 0 rejected; reconciliation still passed.

Private evidence remains under ignored `data/`: `expected-reconciliation.json`, `reconcile_remote.py`, and the SQLite database. An online SQLite backup of the initial import is stored at `data/backups/initial-import-20260927.sqlite`. None of these files is committed or publicly served.

## Automated checks

- Seven API/model tests: authentication, non-HTTP preservation, provenance, duplicate retry counts, explicit rejects, unrestricted historical range, pagination/search, clipped foreground intervals and discarded idle/sleep gaps.
- Native importer test: both SQLite formats, all 1,034 fixture visits over many batches, 516 non-HTTP rows, resume and full replay, exact epoch conversion.
- Chromium runtime: real unpacked extension, live capture, pause, historical import, offline queue, optional-server configuration and authenticated synchronization; dashboard desktop/mobile layout, complete search/pagination, safe rendering of malicious titles/URLs and lock.
- Firefox runtime: temporary extension, UI initialization, native history events, pause, import of a four-year-old visit and authenticated synchronization.
- Zen 1.22.3b Linux runtime: same Firefox-extension integration test using a separate temporary profile. This verifies actual Zen execution, not only Firefox compilation. It does not claim a native macOS Arc/Dia runtime test.
- Firefox extension linter: zero errors. Dynamic innerHTML warnings refer to rendering paths whose external text is HTML-escaped; browser tests exercise malicious title and URL fixtures. The package is not yet Mozilla-signed.

All automated fixtures use in-memory or isolated temporary databases. Production data is preserved throughout.

## Availability and monitoring

HTTPS health returns 200; anonymous or incorrect-key `/api/*` requests return 401; authorized queries return 200. Cloudflare terminates TLS and routes to the loopback service. The deployment uses a user systemd service with restart-on-failure and an existing enabled linger setting.

`myzilla-monitor.timer` probes every minute until **2026-09-27 11:00 Asia/Taipei**. It checks HTTPS, anonymous rejection, authorized access and per-browser counts. Logs are private and include aggregate counts, not raw URLs. This scheduled period is ongoing; do not interpret this record as claiming every future check already passed.

Mac-side verification reported stale local DNS NXDOMAIN despite working public/upstream resolution. Its UI test used an SSH forward to this same service, while HTTPS was verified separately with normal certificate checks.
