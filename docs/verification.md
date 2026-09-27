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

## 帳號與社交第一版（2026-09-27）

- 15 個 TypeScript API／模型測試通過，另有 2 個 Python 匯入／備份測試通過。
- 獨立測試資料庫的兩個 Chromium 工作階段，完成擁有者建立、一次性邀請註冊、登入、朋友接受、雙方同意的興趣配對、分類校正、分享與撤銷；桌面及手機布局通過。
- 原有 Chromium 全量匯入／離線同步、Firefox 及實際 Zen 執行測試通過。容器完成建置並以非 root 執行健康、靜態頁面、下載、匿名拒絕與私人查詢測試。
- 部署前完成 `data/backups/pre-community-20260927.sqlite` 一致性備份，備份與部署後正式 DB 的 100,665 筆事件／來源 SHA256 對帳通過。
- 正式 HTTPS `/community.html` 正常；匿名歷史與社交 API 回傳 401；擁有者驗證後查詢正常。取現有一筆紀錄原樣重播同步，accepted 1、duplicates 1、inserted 0、rejected 0。
- 正式帳號僅有既有擁有者私人空間，尚未替使用者設定密碼；朋友、配對同意與分享都未自動建立或開啟。後續由使用者在介面設定。
- 部署仍為原 systemd + loopback 18140 + Cloudflare Tunnel；容器及 CI 定義已驗證本機可用，尚無 remote/CD。
