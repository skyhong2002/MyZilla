# MyZilla 與 urtube 的架構對齊

共同流程為「來源收集 → 驗證與去重 → 私人資料庫 → 分析查詢 → 個人回顧」。MyZilla 對應全瀏覽器 URL／造訪／前景區間，urtube 對應影片觀看與影片分析；沿用分工方式，保留各自資料語意。

| 職責 | urtube | MyZilla |
| --- | --- | --- |
| 主服務入口 | `src/index.ts` | `src/index.ts` |
| 匯入服務入口 | `src/ingest.ts` | `src/ingest.ts`，可選獨立程序 |
| 執行設定 | `src/config.ts` | `src/config.ts` |
| 資料層 | `src/data/database.ts` | `src/data/database.ts` 初始化；`src/browsing/repository.ts` 管理交易、去重及查詢 |
| 領域處理 | `src/youtube/` | `src/browsing/`；事件契約與時間語意在 `src/shared/` |
| HTTP 共用 | 認證、安全標頭 | `src/http/base.ts` 認證、安全標頭、大小限制、錯誤；`src/http/serve.ts` 啟動與關閉 |
| 回顧呈現 | `src/output/` | `src/ui/`，保留網頁與兩種擴充功能共用的前端 |
| 收集工具 | YouTube 匯入與擴充功能 | 全量 SQLite importer 與 Chromium／Firefox 擴充功能 |
| 維運 | 容器、檢查、備份、CD | Dockerfile、Compose、CI、SQLite 一致性備份；現有正式站仍為 systemd |

`src/server/app.ts` 只組裝模組，`src/server/index.ts` 保留既有 systemd 入口的相容性。主服務仍包含 `/api/events`，已安裝的客戶端不需改網址。`npm run ingest` 預設使用 loopback 18141，只有健康檢查與受驗證的同步入口，不提供 UI 或查詢 API；和主服務使用同一 SQLite/WAL。它是可選擴充入口，現階段沒有另啟動正式匯入程序。

此次分層不變更事件 schema、ID、來源、去重、拒收回報或查詢語意，也不重新建立資料庫。所有造訪（含非 HTTP）仍保留；分頁只影響回傳批次，不截斷總資料。

## 正式部署與可重現建置

目前正式服務維持 `myzilla.service` 和既有 Cloudflare Tunnel，origin 為 `127.0.0.1:18140`。可用 `npm run build` 建置，`npm start` 啟動。`.env` 與 `data/` 不進 Git 或容器映像。

Compose 提供同一主機的容器替代部署方式，以 bind mount 明確沿用 `./data`，不建立空的替代 named volume。切換前先完成備份，確認映像測試與資料目錄擁有者；容器 UID/GID 預設 1000，可用 `MYZILLA_UID`／`MYZILLA_GID` 對齊主機。先停止 systemd 釋放 18140，再 `docker compose up -d --build`；不可同時讓兩者佔用該 port。回復時停止容器再啟動原 systemd，保留同一資料目錄。容器切換尚未執行。

```bash
npm run db:backup -- data/backups/manual-YYYYMMDD.sqlite
# 若服務使用其他 DB 路徑：
npm run db:backup -- data/backups/manual-YYYYMMDD.sqlite --source /path/to/myzilla.sqlite
```

備份工具使用 SQLite backup API 取得包含已提交 WAL 的一致快照，以 0600 建立輸出、執行 quick_check，拒絕覆寫既有檔案。工具讀取 shell 的 `MYZILLA_DB`，不自行載入 `.env`；自訂路徑請明確傳 `--source`。

`.github/workflows/check.yml` 定義建置、單元測試、匯入／備份測試、Chromium／Firefox 執行測試與容器建置。此專案尚無 Git remote，因此 CI 尚未在託管平台執行，也未連接 urtube 的 Komodo/CD；不宣稱已有自動部署。

## 產品層待確定的範圍

這次完成的是共同技術骨架，不等於移植 urtube 全部產品能力。Google 登入與多帳號隔離、興趣分類／分析 worker、朋友／配對和分享尚未實作，是否加入及其優先次序待使用者確認。這些功能不能直接把 urtube 的影片分類、公開設定或有限匯入範圍套用到完整瀏覽歷史。現有私人金鑰與不限日期／筆數的匯入要求持續適用。
