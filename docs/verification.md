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
- 部署仍為原 systemd + loopback 18140 + Cloudflare Tunnel；容器及 CI 定義已驗證本機可用。2026-10-01 起 CI 在 GitHub Actions 執行，仍無 CD。

## 經典 MyZilla 入口（2026-09-28）

- 依 Wayback 原始頁面、樣式及 Wiki 重新實作；來源、完成項目及無法復原部分見 `legacy-features.md`。
- 20 個 TypeScript API／模型測試及 2 個 Python 匯入／備份測試通過。新增測試涵蓋收藏隔離、分頁、重播、朋友可見性撤銷、短網址期限／撤銷、搜尋、RSS、在線同意與電影統計的朋友邊界。
- 獨立資料庫 Chromium 入口測試完成收藏、生活分類、點閱、短網址撤銷、電影及朋友統計、私人搜尋、JSON 重播匯入、RSS、心情與桌面／手機布局。既有 Chromium 同步及社交 UI、Firefox 與實際 Zen 執行測試通過。
- 最終程式完成 TypeScript 檢查、網頁及雙瀏覽器擴充套件建置；Docker image 重建後以非 root 通過健康、首頁、回顧、帳號、下載與登入保護測試。
- 部署前完成 `data/backups/pre-classic-20260928.sqlite` 一致性備份。重啟原 systemd 服務後，正式 DB 的 **100,665** 筆歷史與來源 SHA256 對帳通過，私人證據為 `data/classic-reconciliation.txt`。
- 正式 HTTPS `/health`、`/`、`/dashboard.html`、`/community.html` 均為 200。匿名 sources、portal items／feed／export／searches 均為 401；驗證後收藏與匯出正常，歷史報表仍為 100,665 筆。
- 正式 portal 收藏與公開短網址均為零，沒有測試 fixture 或自動分享。正式部署沿用 systemd、127.0.0.1:18140 及原 Cloudflare Tunnel。
- 前一階段監測已依使用者回報於 2026-09-27 11:00 Taipei 結束：415 次檢查零失敗，最後新增 4 筆 Chrome 後為 100,665 筆；本次沒有重新啟動該限時監測。

## Google 登入（2026-09-28）

- 沿用同機 urtube 既有 Google login client，複製至 MyZilla 0600 私密 `.env`，未修改其他服務設定。正式回呼為 `https://myzilla.observe.tw/auth/google/callback`。
- 28 個 API／模型測試通過，包括 Google state/cookie、PKCE、nonce、issuer/audience/expiration、未驗證 email、重播、過期、取消、同步金鑰拒絕、跨帳號連結拒絕與原 session 撤銷。身分驗證生產實作使用官方 google-auth-library；測試注入模擬 provider。
- 臨時 HTTPS + 記憶體 DB 的 Google 瀏覽器流程通過：未連結拒絕、擁有者連結、一次性交接、登出重登、手機布局。原有社交 UI 測試及非 root 容器測試通過；TypeScript 與完整建置通過。
- 正式 Google 登入入口已走到 Google 登入表單，顯示共用名稱 observe.tw，未出現 invalid_client 或 redirect_uri_mismatch。沒有代替使用者選擇或授權真實 Google 帳號；首次連結需由使用者登入既有私人空間後完成。
- 正式健康與 Google 設定端點 200；匿名私人 API 401；偽造 callback state 被拒絕。Google secret 未出現在任何 web／extension 建置產物。
- 部署前備份 `data/backups/pre-google-20260928.sqlite`。重啟後 100,665 筆正式歷史內容與來源 SHA256 對帳 PASS，私密證據 `data/google-reconciliation.txt`。沒有把測試 Google 身分寫入正式 DB。

## 五面向個人洞察（2026-09-28）

- 32 個 API／模型測試通過，涵蓋頁面日去重、來源隔離、五種分析、無資料期間、非網頁／工具排除計數、錯誤網址、回饋隔離、搜尋及證據分頁。
- 新增 `npm run test:insights`：隔離 fixture DB 完成總覽、五面向、HTML escape、依據分頁、主題更名／工作標記／排除／恢復、空期間與桌面／手機布局。
- 既有 Chromium 完整瀏覽器測試、Firefox 與實際 Zen 擴充功能匯入／同步測試通過。最終 TypeScript／Vite／擴充套件建置與非 root 容器測試通過。
- 正式 API 對 100,665 筆歷史完成分析，首次 HTTPS 計算約 2.6 秒；74,932 筆符合內容分析條件。排除數量與主題涵蓋範圍在 UI 可展開，資料全量掃描而非只取近期或前 N 筆。
- 正式 HTTPS 瀏覽器完成已驗證身分的五個區塊、主題搜尋與手機寬度檢查。匿名 `/api/insights` 為 401；正式 `insight_feedback` 沒有測試項目。
- 部署前備份 `data/backups/pre-insights-20260928.sqlite`；正式原始歷史及來源 SHA256 對帳 PASS，證據為私密 `data/insights-reconciliation.txt`。最終事件數仍為 100,665。
- 主題為本機規則／標題關鍵詞，沒有對外傳送歷史或抓取文章全文；方法與限制見 `personal-insights.md`。新洞察沒有自動加入公開分享或朋友匹配。
- 本機 `/tmp` 空間不足造成一次截圖程序失敗，改用專案忽略的 `data/runtime-tmp` 後操作、截圖及瀏覽器測試均通過，未刪除其他專案檔案。


## 相鄰造訪停留推估（2026-09-28）

- 35 個 API／模型測試通過；新增嚴格 60／180 秒界線、前頁歸屬與重訪累計、跨日期裁切、來源隔離、同時間重複與歧義、內部頁面邊界、API 登入與搜尋測試。
- 瀏覽器測試完成回顧頁門檻切換、各網址搜尋、手機布局及原有五面向洞察。既有 Chromium 匯入／同步與完整歷史操作測試通過。
- 正式 HTTPS 匿名 API 401；全部歷史 60 秒門檻為 72,200 段、19,234 個網址、約 168.8 小時；180 秒為 78,551 段、20,228 個網址、約 352.4 小時。這是來源各自推估的累加，並非互斥閱讀時數。
- 正式 100,665 筆事件／來源 SHA256 對帳 PASS，證據為 `data/dwell-reconciliation.txt`。此變更沒有資料庫 migration 或事件改寫。

## 十項易用性原則修正（2026-09-28）

逐項紀錄見 [易用性檢查表](usability-audit.md)：32 個可重現問題，涵蓋全部十項原則。包含操作狀態、統一導覽、草稿保護、刪除復原、匯入預覽與停止、獨立洞察分頁、錯誤重試、可搜尋說明及鍵盤焦點。

- 36 個 TypeScript API／模型測試、2 個 Python 匯入／備份測試通過。
- 新增 `test:usability`，驗證慢速／503／401、同帳號重新驗證、錯帳號拒絕、保留輸入、欄位錯誤、取消確認、復原、匯入預覽取消／停止、末頁刪除、Back 保護、複製備援、金鑰更換確認、搜尋說明及斷線重試。
- 入口、社交、五面向洞察及 Google 模擬提供者瀏覽器測試通過；真實 Chromium、Firefox、Zen 隔離擴充功能測試通過。Chromium 額外驗證背景更新不會覆蓋已失焦但尚未儲存的設定。
- Firefox lint：0 errors、0 notices、30 個 dynamic `innerHTML` 警告。動態文字有 escape／textContent，惡意標題 fixture 測試通過；不宣稱已完成第三方安全稽核或 Mozilla 簽署。
- Docker 建置與非 root 執行檢查通過，包含新增說明頁與匿名拒絕 `/api/portal/trash`。
- 正式部署前備份 `data/backups/pre-usability-20260928.sqlite`；備份及部署後 `data/myzilla.sqlite` 均對照 `data/final-expected-reconciliation.json` 通過完整內容／來源 SHA256 核對，**100,665 筆造訪完整保留**。原始事件未寫回、重建或清空。
- 正式 HTTPS 網站與說明頁 200；匿名來源、洞察、停留推估及刪除暫存 API 401；驗證後歷史總數與刪除暫存 API 正常。Google 登入路由仍正確轉往 `accounts.google.com`，未代替使用者完成 Google 授權。
- 公開 HTTPS 上以既有帳號唯讀檢查：主要導覽一致，入口／帳號／說明／洞察在 320、390、1440 px 沒有水平溢出，瀏覽器 pageerror 為 0。停留推估及五面向顯示正常。
- 部署仍使用原 user systemd、`127.0.0.1:18140` 與 Cloudflare Tunnel。未安裝擴充功能至使用者設定檔，未替正式帳號建立朋友、分享或更換金鑰。

本輪屬專家檢查與自動化操作測試，未進行真人使用者測試或螢幕閱讀器人工驗證。原有監測已在指定的 2026-09-27 11:00 截止，這次未重啟長期監測。

## 切頁登入狀態與提示修正（2026-09-28）

- 移除一般讀取的全頁「正在處理，請稍候」浮動提示。進頁與背景讀取不鎖定整頁；儲存等明確操作仍保留表單內提示及防止重複送出。
- 已有工作階段時，入口、帳號頁及回顧頁直接呈現登入後的導覽與頁面框架，不先渲染登入表單。資料在所屬區塊讀取；不快取私人歷史來假裝驗證成功。API 仍逐次驗證，失效金鑰回到登入介面。
- 入口讀取加上版本及工作階段檢查，快速切換時不讓舊請求覆蓋目前頁面。
- 慢請求瀏覽器測試以 DOM observer 確認三個入口沒有登入表單閃現、超過提示原本的 500 ms 門檻仍沒有全頁浮動提示、讀取中可切換收藏頁；另驗證失效工作階段與原有復原／匯入／登入流程。

正式三個入口已確認透過 HTTPS 提供新版本資產；健康檢查 200，100,665 筆歷史完整 SHA256／來源對帳仍通過。
