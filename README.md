# MyZilla

個人瀏覽回顧：全部既有歷史、網站排行、可搜尋的造訪紀錄，以及啟用擴充功能後累積的估計前景時間。原始歷史保留在自己的伺服器，不會公開或送入 Infovore。

目前部署：**https://myzilla.observe.tw** → Cloudflare Tunnel → `127.0.0.1:18140`。

## 經典個人入口

首頁現在採 2000 年代 MyZilla 的淡藍、上方導覽與右側功能欄，整合我的網址、網摘、生活分類、多站搜尋、MyURL、電影與心情；既有瀏覽回顧移至 `/dashboard.html`。功能對照、分享邊界及未能復原的項目見 [舊站概念對照](docs/legacy-features.md)。

## 回顧介面

回顧保留 urtube 式雙層導覽，配色與經典入口統一為淺色。頂層切換「儀表板」和「匯入與設定」；儀表板分為「總覽」（統計、常訪網站、最近頁面）、「洞察」（網站分布）、「歷史」（全量搜尋與分頁）及「回顧」（所選期間摘要）。登入、資料來源與擴充功能操作集中在設定頁。

日期範圍、排行依據、搜尋與分頁位置保存在網址，跨頁、重新整理與瀏覽器上一頁都可保留狀態；網址不包含金鑰。回顧使用既有統計，不推算匯入歷史的閱讀時間。

## 架構

採用與 urtube 對應的主服務、匯入、資料層與回顧呈現分工，附容器建置、CI 與一致性備份。分層、部署狀態及尚未移植的產品功能見 [架構說明](docs/architecture.md)。

## 帳號、興趣與朋友

從「帳號與朋友」以原始金鑰建立擁有者帳號，或使用邀請碼建立獨立私人帳號。可修正網站興趣分類、送出朋友邀請、雙方同意後比較分類分布，並主動產生可撤銷的限時摘要連結。詳見 [帳號與分享說明](docs/accounts-and-sharing.md)。

## 啟動

需要 Node.js 24+、npm、Python 3。

```bash
npm ci
cp .env.example .env
# 在 .env 設定隨機 MYZILLA_TOKEN，至少 32 字元；不要提交金鑰。
npm run build
npm start
```

資料庫預設 `data/myzilla.sqlite`，金鑰透過 `Authorization: Bearer …` 驗證。公開網站提供登入介面、擴充功能下載、健康檢查與使用者主動建立的限時摘要分享；`/api/*` 一律驗證身分。開發介面可另跑 `npm run dev`。

現有部署由使用者 systemd 管理：`systemctl --user status myzilla`。正式 `.env` 與 `data/client-token` 權限為 0600，均不納入 Git。請透過自己的 SSH 連線取用金鑰，然後貼入網站或擴充功能。服務只綁定 loopback，外部走既有 tunnel。

## 全量匯入：Brave、Arc、Chrome、Dia、Zen 的所有設定檔

原生工具直接讀取 Chromium `History` 或 Firefox／Zen `places.sqlite` 的每一筆造訪，不設日期或總筆數上限，不略過非 HTTP 紀錄。每個設定檔各跑一次，保留固定 browser／profile／device 名稱。先取得一致的 SQLite 快照（包含 WAL 已提交資料）；來源以唯讀交易開啟，不修改瀏覽器資料庫。

```bash
python3 scripts/import_history.py \
  --db /path/to/snapshot/History \
  --browser Brave --profile Default --device Sky-Mac \
  --token-file /private/path/myzilla-token
```

Zen 改用 `--db /path/to/places.sqlite --browser Zen`。`--inspect` 只計數；再次執行會從 checkpoint 續傳；`--restart` 全量重送並由伺服器去重。空資料庫回報 0 筆完成。每批明列 accepted、inserted、duplicates、rejected；拒收資料會留下明細並停止，避免跳過來源列。詳細格式見 [匯入契約](docs/import-contract.md)。

每筆原始 visit ID 保留於 `sourceVisitId`，資料主鍵為 `(deviceId, id)`；來源 ID 由固定 device／browser／profile 名稱決定。設定檔重建導致 ID 重新使用時，請給新設定檔不同名稱。原始時間由微秒換算為 Unix 毫秒，原始 transition 值以字串保存。

## 新瀏覽紀錄與前景時間

`npm run build` 產生：

- `dist/chromium/`：Brave、Chrome、Arc、Dia 等 Chromium 桌面瀏覽器，核心版本至少 120。
- `dist/firefox/`：Firefox／Zen 桌面版，Firefox 核心至少 140。
- 網站 `/downloads/` 提供兩種 ZIP 與原生匯入 CLI。

Chromium：開啟該瀏覽器的擴充功能管理頁、開啟開發人員模式，選「載入未封裝項目」，指定解壓後含 `manifest.json` 的目錄。

Zen／Firefox：開啟 `about:debugging#/runtime/this-firefox`，選「暫時載入附加元件」，指定 `dist/firefox/manifest.json`。此原型尚未 Mozilla 簽署，暫時安裝會在瀏覽器重新啟動後移除，需要重新載入。正式長期安裝需要另做簽署發佈。

每個瀏覽器、每個設定檔都必須個別安裝。點工具列 MyZilla，填寫伺服器網址、金鑰、瀏覽器／設定檔／裝置名稱，授權連線，按「開始記錄」。預設不記錄，不在無痕視窗執行。伺服器選用 HTTPS，本機測試可使用 loopback HTTP。記錄到 IndexedDB 後分批同步，離線自動保留佇列。

原生匯入已完成的設定檔，擴充功能只需開始記錄新的活動；不要再按「匯入全部歷史」，以免用另一個來源 ID 重複匯入相同歷史。擴充功能的全量匯入按鈕適用於未做原生匯入的設定檔，進度會持久化，背景逐批完成。

「暫停記錄」停止新的活動收集；已排程的匯入與待同步資料仍會送出。第一版沒有自動刪除本機／伺服器歷史，瀏覽器端刪除歷史也不會刪除先前匯入的伺服器資料。

## 統計語意

- 歷史紀錄只有造訪次數；不推算過去的停留時長。
- 前景時間根據分頁、視窗焦點、閒置事件和 30 秒觀測計算；60 秒閒置後停止，超過 45 秒的觀測空白捨棄，避免休眠／重啟灌水。這是保守估計，可能低估，不代表實際閱讀。
- 歷史查詢預設「全部」，每頁 200 筆，可連續翻頁；搜尋涵蓋整個所選期間，沒有總筆數截斷。其他日期範圍依檢視端本機時區。
- 多裝置同時使用的前景時間相加，不代表一個人的互斥時間線。
- 所有網址與標題原樣保留（NULL 以空字串呈現），非 HTTP 或含帳密的網址不呈現可點擊連結。頁面文字經 HTML escape，沒有第三方分析或遠端字型請求。

## 驗證

```bash
npm test
npm run test:importer
npm run test:browser
npm run test:community
npm run test:portal
npm run lint:firefox
npm run test:firefox
```

實際測試結果與正式資料對帳見 [驗證紀錄](docs/verification.md)。若要以已安裝的 Zen 執行相同測試，可使用 `ZEN_BINARY=/path/to/zen npm run test:firefox`。

瀏覽器測試先安裝 Playwright Chromium／Firefox：`npx playwright install chromium firefox`。測試使用記憶體或獨立暫存資料庫，絕不重建正式 DB。

本機部署的 `myzilla-monitor.timer` 每分鐘檢查 HTTPS、匿名 401、驗證後 API 與來源筆數，直到 **2026-09-27 11:00 Asia/Taipei**。最新結果在 `data/monitor/latest.json`，歷次結果在 `data/monitor/checks.jsonl`；只記錄統計，不記錄網址。這是健康監測，不代表已對所有瀏覽器安裝持續擷取功能。

## 範圍與後續

目前支援邀請制多帳號、網站規則分類、雙方同意的朋友配對及摘要分享。尚無 Google OAuth、外部 AI 語意分類、公開陌生人配對或策展投遞箱。Infovore 整合評估見 [摘要來源設計](docs/infovore-summary.md)。
