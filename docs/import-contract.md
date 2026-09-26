# MyZilla bulk import v1

Endpoint: `POST https://myzilla.observe.tw/api/events`
Header: `Authorization: Bearer <MYZILLA_TOKEN>`
Content-Type: `application/json`

```json
{
  "deviceId": "2b9b1f4a-245e-4562-a1f8-a88834916f63",
  "source": {"browser":"Brave", "profile":"Default", "device":"Sky Mac", "method":"native"},
  "events": [{"kind":"visit", "id":"visit:123", "sourceVisitId":"123", "url":"https://example.org/", "title":"Example", "visitedAt":1720000000000, "transition":"1"}]
}
```

- `deviceId` identifies one stable device/browser/profile source, not the temporary snapshot file. CLI computes UUIDv5 from stable labels. Preserve spelling across retries.
- Primary key: `(deviceId, event.id)`. Native visit IDs are `visit:<source integer id>`.
- `visitedAt`: Unix milliseconds. Chromium timestamp / 1000 - 11644473600000; Firefox timestamp / 1000. Raw source transition is retained as a string.
- All source rows are accounted for, including internal, file, empty and non-HTTP URLs. The UI only links HTTP(S) URLs without embedded credentials.
- Batches: 1–250 events, maximum HTTP body 16 MiB. No date or total-count limit.
- Response: `{accepted, inserted, duplicates, rejected, rejections:[{index,id,reason}]}`. `accepted=inserted+duplicates`; `accepted+rejected=batch length`. Malformed envelopes return HTTP 400; missing/incorrect authentication returns 401. Per-event validation errors return HTTP 200 with explicit rejections.
- Source reconciliation: `GET /api/sources` with the same bearer token. Returns counts by stable source and event kind.
- Retry transient errors; advance checkpoint only after a valid acknowledgment. CLI stops on rejected events, writes a private rejection file, and does not advance that batch.
- Existing visit IDs do not overwrite stored events. If a browser profile is reset and IDs reused, give the new profile incarnation a distinct label.
- A native import and extension import are separate sources unless deliberately given the same source ID. Do not import the same historical profile via both methods: use native for old history, extension for new monitoring.

## CLI (Python 3 standard library, no dependencies)

Download `https://myzilla.observe.tw/downloads/import_history.py` or use `scripts/import_history.py`.
Obtain the token through your existing authenticated SSH connection from `/home/deck/Projects/MyZilla/data/client-token`. Do not put tokens in shell arguments, URLs, or shared chat.

```bash
python3 import_history.py \
  --db /path/to/stable-snapshot/History \
  --browser Brave --profile Default --device Sky-Mac \
  --token-file /private/path/myzilla-token
```

Repeat for every database snapshot using its original profile label. Use `--db .../places.sqlite --browser Zen` for Firefox format. `--inspect` prints source counts without uploading. Re-running resumes from `~/.myzilla-import/`; `--restart` replays every row and deduplicates on the server. Keep device/browser/profile labels stable. Native importer opens SQLite read-only and uses a read transaction; use a verified stable snapshot with WAL contents already included. No browser DB is changed.

Reconcile each source against its local snapshot row count using authenticated `/api/sources`. An empty source is reported as 0 completed rows by the CLI.
