# 設計評審截圖清單

每一輪都照這份清單截圖，ID 與 `tools/states.mjs` 一致。每個狀態截兩張：

| 尺寸 | 視窗 | 像素比 | 截圖高度 |
|---|---|---|---|
| `desktop` | 1440 × 900 | 1 | 從頁首起，最多 2400 px |
| `mobile` | 390 × 844（觸控） | 2 | 從頁首起，最多 1688 CSS px |

固定條件：

- **資料全部是合成的**：`tools/seed.mjs` 透過公開 API 在暫存資料庫建立虛構使用者「林小晴」（約 3,600 筆造訪、12 筆網址、電影、心情、搜尋記錄、短網址、待整理、3 份選集）、朋友「陳美玲」、一位待接受邀請的「王大偉」，以及沒有任何資料的「新朋友」帳號。不讀 `/srv/myzilla/data` 或任何真實瀏覽紀錄。
- 瀏覽器時鐘固定在 2026-11-12 22:30（Asia/Taipei）；減少動態效果。
- 頁面發出的外部請求一律在瀏覽器內攔截：favicon 回傳無圖示（顯示字母），AI 週回顧用 `states.mjs` 的虛構內容，Google 登入只回報「已啟用」。
- 會寫入資料的狀態（刪除、匯入）由攔截器回應成功，不改動共用資料庫。
- 截圖瀏覽器一次只開一個；建置與截圖前先確認 load1 ≤ 10。

## 頁面與狀態

| ID | 頁面 | 狀態 | 重現方式 |
|---|---|---|---|
| `entry-signed-out` | 入口 `/` | 未登入 | 不帶登入 |
| `entry-signed-out-dark` | 入口 | 未登入、深色 | `prefers-color-scheme: dark` |
| `entry-key-open` | 入口 | 展開「使用既有存取金鑰」 | 點該文字，只截視窗 |
| `home` | 今日入口 `/#home` | 有資料 | 擁有者 |
| `home-dark` | 今日入口 | 深色 | |
| `home-empty` | 今日入口 | 全新帳號 | 空帳號 |
| `home-loading` | 今日入口 | 載入中 | API 不回應 |
| `home-error` | 今日入口 | 載入錯誤 | API 回 500 |
| `bookmarks` | 我的網址 `/#bookmark` | 有資料 | |
| `bookmarks-no-results` | 我的網址 | 搜尋無結果 | `?q=zzqxv` |
| `bookmark-editor` | 我的網址 | 新增網址對話框 | 點「新增網址」，只截視窗 |
| `bookmark-delete-undo` | 我的網址 | 刪除後的復原通知 | 點第一個「刪除」並確認，只截視窗 |
| `movies` | 我的電影 `/#movie` | 有資料 | |
| `moods` | 我的心情 `/#mood` | 有資料 | |
| `inbox` | 待整理 `/#inbox` | 有資料 | |
| `collections` | 主題選集 `/#collections` | 有資料 | |
| `collection-detail` | 選集內容 | 擁有者的選集 | `?collection=<金澤行程>` |
| `search-history` | 搜尋記錄 `/#search` | 有資料 | |
| `links` | 短網址管理 `/#links` | 有資料 | |
| `online` | 線上使用者 `/#online` | 朋友在線 | |
| `tools` | 匯入與工具 `/#tools` | 有資料 | |
| `import-confirm` | 匯入與工具 | 匯入步驟 1：確認 | 選三筆的 JSON，按「匯入全部項目」，只截視窗 |
| `import-progress` | 匯入與工具 | 匯入步驟 2：進行中 | 確認後寫入請求不回應，只截視窗 |
| `import-done` | 匯入與工具 | 匯入步驟 3：完成 | 確認後寫入請求回成功，只截視窗 |
| `overview` | 瀏覽回顧 `/dashboard.html#overview` | 有資料 | |
| `overview-dark` | 瀏覽回顧 | 深色 | |
| `overview-empty` | 瀏覽回顧 | 全新帳號 | 空帳號 |
| `overview-loading` | 瀏覽回顧 | 載入中 | API 不回應 |
| `overview-error` | 瀏覽回顧 | 錯誤 | API 回 500 |
| `insights` | 洞察 `#insights` | 有資料 | |
| `history` | 歷史 `#history` | 有資料 | |
| `history-search` | 歷史 | 搜尋「口琴」 | `?q=口琴` |
| `history-no-results` | 歷史 | 搜尋無結果 | `?q=zzqxv` |
| `recap` | 回顧 `#recap` | 近 30 天 | `?range=30` |
| `settings` | 匯入與設定 `#settings` | 已登入 | |
| `dashboard-signed-out` | 瀏覽回顧 | 未登入 | |
| `community-signed-out` | 帳號與朋友 `/community.html` | 未登入 | |
| `community-account` | 帳號 `#account` | 擁有者 | |
| `community-interests` | 興趣分析 `#interests` | 有資料 | |
| `community-friends` | 朋友與配對 `#friends` | 一位朋友、一個待接受邀請 | |
| `community-friends-dark` | 朋友與配對 | 深色 | |
| `community-shares` | 分享 `#shares` | 一個有效分享 | |
| `help` | 使用說明 `/help.html` | 全文 | 未登入 |
| `help-search` | 使用說明 | 搜尋「分享」 | 填入 `#help-search` |

## 參考對手

第一輪截一次，之後每輪重用同一組檔案（`tools/capture.mjs references`）。都是不用登入就能看到的書籤、收藏與內容整理產品：

| ID | 網址 | 對應的 MyZilla 頁面 |
|---|---|---|
| `arena-explore` | https://www.are.na/explore | 主題選集列表 |
| `arena-channel` | https://www.are.na/are-na-team/are-na-blog | 選集內容 |
| `raindrop-home` | https://raindrop.io/ | 入口與產品介紹 |
| `linkding-demo` | https://demo.linkding.link/bookmarks | 我的網址 |

實際截到的參考圖以 `results/README.md` 的紀錄為準。

## 重現

```bash
# 0. 依賴與建置（load1 ≤ 10 再跑）
nice -n 15 ionice -c3 npm ci && nice -n 15 ionice -c3 npx vite build
# 基準：main 的介面另建到 /tmp/mz-review/web-main（git worktree + vite build --outDir）
# 1. 合成資料：空資料庫啟動一次服務，跑 seed，關掉後把資料庫複製給每個要截的版本
MYZILLA_DB=/tmp/mz-review/data/seed.sqlite MYZILLA_TOKEN=<32+ 字元測試金鑰> PORT=18160 node --import tsx src/index.ts &
node docs/design-review/tools/seed.mjs http://127.0.0.1:18160 <測試金鑰> /tmp/mz-review/data/tokens.json
# 2. 每個版本各起一個服務：MYZILLA_WEB_ROOT 指向該版本的建置結果，MYZILLA_DB 指向資料庫副本
# 3. 截圖（一次一個瀏覽器）
node docs/design-review/tools/capture.mjs site http://127.0.0.1:18161 /tmp/mz-review/data/tokens.json OUT_DIR
node docs/design-review/tools/capture.mjs references /tmp/mz-review/sets/reference
# 4. 組一輪盲測
python3 docs/design-review/tools/make_round.py 1 OUT_DIR
```
