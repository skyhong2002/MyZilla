# 從瀏覽到選集

首頁提供持續關注的內容線索、待整理、最近編輯的選集及朋友分享。收藏與待整理先顯示，較慢的主題分析在獨立區塊補上，不阻擋頁面操作。

## 操作流程

- 洞察主題「挑選相關頁面」開啟保留原期間、時區的依據清單；每頁 20 筆可全選，沒有總結果截斷。
- 歷史、洞察依據、時間推估、原有網址／網摘／有網址的電影，以及朋友分享的收藏，都能用同一個整理對話框加入私人待整理或選集。舊收藏筆記不自動複製，避免把私人註記意外加入共用選集。
- 待整理有 pending／kept／dismissed 三種狀態。保留、略過、復原只影響整理狀態，原始 visit 不變。加入選集會將同網址的自己的待整理項目標成 kept。
- 選集有名稱、介紹、標籤、依序排列的連結與每篇推薦理由。預設私人；可以選擇朋友可見，也可指定已接受的朋友共同編輯。
- 指定編輯者可加入、移除、排序、修改標題與理由；只有建立者能變更選集介紹／權限、增減編輯者及發布快照。移除朋友立即失去權限，也刪除共同編輯授權，重新加回朋友不自動恢復編輯權。
- 朋友頁與配對結果可直接開啟對方主動分享的選集，並將想看的連結留下。個人原始洞察仍不會因為成為朋友而自動公開；既有興趣配對分數仍是網站分類比例，不冒稱為語意主題匹配。
- 封存保留選集內容，撤銷公開快照與共同編輯權限，改為私人。已封存清單可復原，不復活原連結或授權。

## 分享

「預覽與分享」列出實際分享的選集名稱、介紹、標籤，以及每筆標題、完整網址、推薦理由。建立 1／7／30 天有效的持連結可讀快照；不包含 sourceVisitId、裝置、profile、造訪時間、瀏覽頻率或其他原始歷史。原始網址本身可能含私人參數，所以在發布前完整顯示。

後續編輯／改回私人不會變更已發布的快照，建立者可逐一撤銷；封存會全部撤銷。連結 token 只在建立當下顯示，資料庫只存 hash。分享頁 no-store、noindex、禁止嵌入並跳脫文字。不得把不同分享機制混為一談：原本 MyURL 仍只轉址，興趣摘要仍是分類快照，主題選集快照才包含選取連結與理由。

## 分頁收集

擴充功能 0.2.0 在「匯入與設定」提供手動挑選目前開啟的分頁。Chromium 使用 tabs + tabGroups，呈現群組名稱與 shared 標記；Firefox／Zen 不要求 tabGroups 權限，提供逐頁挑選。只讀本設定檔當下可取得的分頁，不假設後端能透過 Chrome 分享網址讀取遠端群組；不把工作階段的 groupId 當永久識別碼。沒有自動關閉、刪除或持續同步群組。

先預覽並勾選，才以每批 200 筆送入私人待整理。顯示 accepted／inserted／duplicates／rejected；分批處理沒有總筆數上限，連線失敗可重送。非 HTTP(S)、帶帳密 URL 與私人分頁不列入分頁收集，但不影響原生 importer 對全部歷史（包含非 HTTP）的保存。

擴充功能仍需由使用者安裝或更新到實際使用的各個 profile。Chromium 新增 tabGroups 權限；Firefox 封裝會移除該權限。

## 實作與契約

`src/curation/routes.ts` 使用同一 SQLite 的新增 `curation_*` 表；原有事件、帳號、收藏不搬移、不重建。SQLite 一致性備份涵蓋全部資料；原有收藏 JSON 匯出仍只匯出舊收藏，並非選集備份。

| 端點 | 用途 |
| --- | --- |
| POST /api/curation/capture | `{items:[{url,title,note?}]}`；每批 1–200，逐筆驗證與拒收索引，回覆明確計數。登入或自己的同步金鑰可寫入。 |
| GET /api/curation/inbox | status、q、offset 查詢；每頁 20。 |
| PATCH /api/curation/inbox/:id | 更新 status；本人限定。 |
| GET /api/curation/collections | audience=mine/friends/editable/archived，q、owner、offset。 |
| PUT /api/curation/collections/:id | UUID 建立選集，修改時提供 revision。 |
| GET /api/curation/collections/:id | 依角色回傳選集；只有建立者能讀成員與有效分享清單。 |
| POST /api/curation/collections/:id/items | 明確加入選定連結，每批最多 200；同選集同 URL 去重。 |
| PATCH /api/curation/collections/:id/items/:item | 標題、note、revision。 |
| POST /api/curation/collections/:id/order | 全部 entry IDs 與 revision；拒絕遺漏或重複 ID。 |
| DELETE /api/curation/collections/:id/items/:item?revision=N | 移出選集。 |
| PUT/DELETE /api/curation/collections/:id/members/:account | 指定或撤銷共同編輯；編輯者可退出。 |
| POST /api/curation/collections/:id/share | days 與 revision，確認預覽版本後發布快照。 |
| DELETE /api/curation/collections/:id/shares/:share | 撤銷快照。 |
| DELETE /api/curation/collections/:id?revision=N | 封存並撤銷分享與成員。 |
| POST /api/curation/collections/:id/restore | 復原為私人選集。 |
| GET /collection/:token | 唯一匿名可讀的選集快照頁。 |

除 capture 外，整理 API 不接受裝置同步金鑰。寫入前重新驗證帳號／角色；排序、編輯與發布以 revision 偵測衝突並回覆 409，拒絕靜默覆蓋。URL 以標準 URL 序列化作去重鍵，保留 query 與 fragment。

## 驗證

`tests/curation.test.ts` 覆蓋帳號隔離、去重與重送、逐筆拒收、裝置金鑰邊界、朋友／編輯權限、排序版本衝突、快照內容／撤銷及封存復原。`npm run test:curation` 使用暫存資料庫驗證主題挑選到發布、歷史加入、略過復原、表單保護、朋友共同編輯與桌機／手機布局。既有 Chromium／Firefox 執行測試增加分頁收集檢查。

API 參考：[Chromium tabGroups](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)、[Firefox tabs.query](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/query)。群組 ID 僅用於當次 UI 分組，待整理以帳號內的網址去重。

正式資料保護：部署前建立 `data/backups/pre-curation-20260929.sqlite`，依 `data/final-expected-reconciliation.json` 核對 14 個來源的 100,665 筆歷史；測試一律使用隔離資料庫與瀏覽器 profile。主機 `/tmp` 空間不足時，測試可設 `TMPDIR=$PWD/data/test-tmp`。新前端先建置至 `data/curation-preview`，用 `MYZILLA_WEB_ROOT=./data/curation-preview` 驗證後才切換正式 HTML；舊版雜湊資產暫時保留，供已開啟頁面完成載入。

本次驗證結果：40 項 API／模型測試、2 項匯入／備份測試，以及選集、舊收藏、可用性、洞察、帳號社交、Chromium 與 Firefox 執行測試通過。正式 HTTPS health=200，匿名 sources／inbox／collections=401，登入後首頁與真實主題依據可讀，部署後原始歷史 SHA256／來源對帳通過。Firefox lint 無 errors／notices，仍有 37 項打包程式碼的動態 HTML／eval 警告；動態文字使用 escaping，XSS 測試通過，未將 lint 警告描述成全數消除。


## 日常入口與圖示

首頁優先呈現日期、搜尋、常用收藏與最近看過的六個不同網頁，再呈現電影／心情／網摘入口、主題洞察、跨月回訪、選集與朋友分享。常用收藏取「我的網址」依既有點閱次數排序的前八筆；點擊沿用原本的開啟計數。搜尋可選自己的全部歷史或 Google，後者沿用私人搜尋記錄。最近頁面的日期是實際造訪日期，不把匯入的舊資料描述成今天的活動。首頁的小型清單是展示範圍，完整歷史與收藏仍有原入口可讀。

`src/ui/icons.ts` 提供本站 SVG 圖示與動態頁面的圖示套用；導覽、操作及對話框保留文字標籤，圖示標記 aria-hidden，沒有 icon font、遠端 favicon 或圖示服務請求。`tests/curation-browser.mjs` 增加首頁收藏開啟計數、歷史搜尋、Google 搜尋記錄及圖示呈現驗證，使用獨立 18149 port。
