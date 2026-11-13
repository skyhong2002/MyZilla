# r8 blind review: Claude Opus 5.5 (effort high)

- Date: 2026-11-13
- Brief: `brief.md`, SHA-256 `9fe8f7b60e39b420dc1e9f208fe60068e37ae097560109a4805747f6296cc24b`
- Reviewer: claude-proxy `claude-opus-5-5`, effort high, fresh session with no other context
- Mapping (revealed after the review): **B = new** (commit `8fb6691`, round-7 fixes), **A = reference**, **C = baseline** (`main` at `5d8ab8c`)

Raw reviewer output below, unedited.

---

## 組 A
總分：6.5 / 10
一句話總評：A 組是參考用的其他產品（Raindrop 行銷首頁、Linkding 書籤列表、Are.na 頻道與探索）。三者各有一套明確風格，Raindrop 的品牌與層級最成熟；但 Are.na 有大量「Loading」空格與檔名當標題，Linkding 的操作連結很小，狀態與無障礙都偏弱。

| 項目 | 分數 | 證據（狀態 ID、尺寸、看到的事實） |
|---|---|---|
| 資訊層級 | 7.5 | raindrop-home desktop：大標「All-in-one bookmark manager」配兩個主次分明的按鈕（實心 Sign up／文字 Download app），右側是產品截圖，一眼看懂；linkding-demo desktop：左邊書籤列表、右邊 Bundles／Tags，主次清楚；arena-explore desktop：標題下只有 View／Sort 兩組小字選項，主內容卡片沒有層級。 |
| 字體排印 | 7 | raindrop-home mobile：標題約 48px 粗體、內文大而易讀；linkding-demo desktop：標題、標籤加描述、meta 三行節奏一致，過長描述用「…」截斷；arena-channel desktop：Info 欄位字級很小，且「Modified」「Length」漸淡到幾乎看不見。 |
| 色彩 | 7 | raindrop-home：品牌藍按鈕，搭配粉、黃、綠的柔和色塊與功能說明框（Collections 黃、Highlights 粉），系統一致；linkding：紫色主按鈕＋青綠標籤；arena：幾乎全是黑白灰，只有 Sign up 用深藍。截圖裡看不到深色模式。 |
| 間距與版面 | 7 | linkding-demo desktop：主欄加側欄約 800px 置中，1440 寬兩側大量留白；arena-channel desktop：四欄格線整齊，但縮圖是整頁截圖縮小，內容讀不出來；raindrop-home desktop：產品截圖刻意出血到右緣，節奏好。 |
| 一致性 | 6.5 | 各產品內部一致：linkding 每列都是「View Edit Archive Remove｜Notes」；arena 卡片樣式統一。不過 arena-explore desktop 的卡片混了圖片、文字方框、PDF、空白「Loading」等形態，視覺很雜。 |
| 資訊密度 | 7 | linkding-demo desktop：一屏約 30 筆書籤，非常高效；arena-channel desktop：一屏 4×5 縮圖，但縮圖看不清；raindrop 是行銷頁，密度低但合理。 |
| 導覽 | 6.5 | linkding-demo mobile：頂部紫色「＋」與漢堡選單，搜尋加 Filters；arena-channel desktop：麵包屑「Are.na / Are.na Editorial / Are.na Blog」能看出位置；arena-channel mobile：底部浮動的 Log in／Sign up 列壓在卡片標題上。 |
| 狀態與回饋 | 5 | arena-explore desktop：第四列整排四格只顯示「Loading」，沒有骨架；卡片標題直接顯示「5B2C28D9-9A48-40D1-…」「i.shgcdn-10.webp」這類檔名；linkding 的列表裡看不到刪除確認或復原的線索。 |
| 響應式 | 7 | raindrop-home mobile：重排成單欄，Menu 收合，標題放大，處理得好；linkding-demo mobile：動作連結換到第二行；arena-channel mobile：兩欄縮圖，但底部浮動列和內容重疊（截圖底部「Log in」蓋住卡片標題）。 |
| 文案 | 7 | raindrop：「Intuitive. Powerful. Runs everywhere」簡潔；linkding：動作詞明確；arena-explore：檔名、hash 直接當標題，像內部資料外露。 |
| 無障礙 | 5.5 | linkding-demo desktop：「View Edit Archive Remove」是約 12px 的灰色文字連結，點擊範圍很小，Remove 也沒有危險色；arena-channel desktop：淡灰 meta 對比明顯不足。 |
| 信任與隱私 | 6 | linkding 的 Remove 和 Edit 並排，沒有危險色；raindrop 是行銷頁，不涉及私人資料；arena 的公開頻道沒有私隱問題，但也看不到任何分享範圍說明。 |

要保留的優點：
- raindrop-home 的首屏層級：大標、一句副標、一個實心主按鈕加一個文字次按鈕，加上產品截圖。
- raindrop 用帶色底的說明框（Collections、Highlights）區分功能，配色有系統。
- linkding-demo 的高密度書籤列：標題、#標籤、描述、meta 和動作壓在三行內，一屏可掃約 30 筆。
- arena-channel 的麵包屑標題，路徑清楚。
- raindrop-home mobile 的重排，不是單純縮小。

最重要的五個問題（由嚴重到輕微）：
1. [狀態與回饋] [arena-explore] [desktop] 整排卡片只寫「Loading」、沒有骨架或縮圖 —— 使用者看到的是大片空白方框，以為壞掉 —— 改用固定比例的骨架，或延後載入時保留模糊縮圖。
2. [文案] [arena-explore] [desktop] 以「5B2C28D9-9A48-…」「i.shgcdn-10.webp」等檔名當卡片標題 —— 系統資訊外露、不可讀 —— 沒有標題時改顯示來源網域或「未命名圖片」。
3. [無障礙] [linkding-demo] [兩者] 「View Edit Archive Remove」是很小的灰色文字連結，Remove 沒有危險色 —— 點擊範圍不足、容易誤刪 —— 加大點擊範圍，把 Remove 放進選單或加上危險色。
4. [響應式] [arena-channel] [mobile] 底部浮動的 Log in／Sign up 列壓在卡片標題上 —— 內容被遮住 —— 底部預留安全距離或改成頂部按鈕。
5. [字體排印] [arena-channel] [desktop] Info 欄的「Modified」「Length」漸層淡出到看不清，縮圖是整頁截圖縮小 —— 資訊讀不到 —— 提高 meta 對比，縮圖改用文章主圖。

## 組 B
總分：8 / 10
一句話總評：B 組是現代、有系統的 MyZilla 版本：頂部列加左側分組側欄，靛紫品牌色一致，深色外觀成立，錯誤、匯入、空資料都有清楚的下一步；剩下的是列表密度、少數用色（暖色回顧卡）和文案用詞不一致等細節。

| 項目 | 分數 | 證據（狀態 ID、尺寸、看到的事實） |
|---|---|---|
| 資訊層級 | 8.5 | home desktop：日期、大標「今天，從這裡開始。」、合一的搜尋框（含「我的瀏覽紀錄」範圍與靛紫搜尋鈕）、本週回顧、常用收藏、接著上次看，順序合理；entry-signed-out desktop：左邊主張與說明，右邊登入卡（實心「帳號登入」），下方四張功能卡加隱私說明，未登入的人一看就懂。 |
| 字體排印 | 8 | home desktop：標題、段落標題（本週回顧／常用收藏）、meta 三級清楚；長標題「Streaming response stalls behind Cloudflare Tunnel • Issue #3921 • honojs/hono」在卡片內自然換行；但 overview-dark desktop「Arc • Default • Lin MacBook Air」這類 meta 約 11–12px，偏小。 |
| 色彩 | 8 | 靛紫是唯一主色（頂部目前頁的膠囊、搜尋鈕、新增網址、連結）；home-error desktop 用淡紅底卡、紅字說明，語意清楚；overview-dark desktop 深色外觀成立，長條圖改成淡紫、「私人」是綠色徽章。扣分：本週回顧卡在淺色是蜜桃色底（home desktop），在深色變成褐色大區塊（overview-dark desktop），和靛紫系統不搭，看起來發髒。 |
| 間距與版面 | 8 | bookmarks desktop：左側欄約 220px、主欄約 920px，篩選三個下拉對齊同一格線；home desktop 常用收藏 5 欄卡片對齊。扣分：bookmarks desktop 每張卡右上的「私人」小字浮在卡片中段（約 x=990），與右側動作按鈕之間有大片空白，對齊點不明。 |
| 一致性 | 8 | 頂部列、側欄、卡片圓角、細框按鈕（整理這個連結／加到我的網址）在 home、overview、bookmarks 一致；import-progress desktop 檔案選擇器已本地化成「選擇檔案」，下載按鈕用下載圖示。扣分：同一動作在 home desktop 寫「加到我的網址」，在 overview-dark desktop 寫「加入我的網址」。 |
| 資訊密度 | 7.5 | home desktop 一屏同時看到回顧、9 個常用收藏、6 張接著上次看；bookmarks desktop 每筆約 117px、3 顆一樣的按鈕（開啟網址／編輯／更多）重複 12 次，比 Linkding 的密度低一半以上；community-interests 的「未分類」佔 69.7%，好幾列是 0% 的空長條。 |
| 導覽 | 8 | home desktop：頂部 6 個主區塊加側欄「整理／收藏／更多」分組，目前頁都有淡紫底高亮；home mobile：「選單」按鈕加橫向捲動膠囊（今日入口／待整理／主題選集…），第 4 顆在右緣被裁切，暗示可捲動；overview-dark desktop 子分頁「總覽／洞察／歷史／回顧」加分段日期控制。扣分：頂部叫「我的入口」，側欄第一項卻叫「今日入口」，兩個名字指同一處。 |
| 狀態與回饋 | 8.5 | home-error desktop：「暫時讀不到你的入口」、紅字原因、「收藏與瀏覽紀錄都沒有變動。」加上「重新載入」主按鈕，安撫與下一步俱全；import-progress desktop：頂部「匯入進度 0/3」、進度條、就近的「停止匯入」，匯入中登出按鈕也被停用；overview-dark desktop 標示「已連線・所有資料來自你的私人伺服器」。 |
| 響應式 | 8 | recap mobile：桌面表格改成卡片（標題、網址、整理按鈕、推估停留、計入次數），沒有橫向溢出；home mobile：常用收藏改成 2 欄，搜尋框的範圍下拉與搜尋鈕排在同一行。扣分：home mobile 頂部「選單」與膠囊列是兩套並存的導覽，佔了第一屏約 130 CSS px。 |
| 文案 | 7.5 | entry-signed-out：「瀏覽過的、收藏的，都在自己手上。」自然；overview-dark：「AI 只依頁面標題與網址推測整理，不讀頁面內文；每天 08:00 有新紀錄時更新。如何產生？」透明又易懂。扣分：「加到／加入我的網址」不一致；「歷史推估停留」「計入次數」偏技術；community-friends 的「99% 分布相似度」沒有說明意義。 |
| 無障礙 | 7.5 | 主按鈕是白字配實心靛紫，對比足夠；mobile 按鈕約 44px 高（home mobile「搜尋」「整理這個連結」）。扣分：overview-dark 的 meta 灰字小且對比偏低；bookmarks desktop「私人」只是淺灰小字，沒有圖示。 |
| 信任與隱私 | 8.5 | entry-signed-out desktop：「私人內容只在登入後顯示，存在自己的伺服器。」加上「只有自己主動分享的內容會對外開放」；頁尾每頁都有「私人內容只有自己看得到」；overview-dark 的「私人」徽章；community-shares 交代了分享內容、快照與撤銷方式；import-progress 匯入中停用登出。 |

要保留的優點：
- home 的合一搜尋框：範圍下拉（我的瀏覽紀錄）加主按鈕，一個入口同時找舊頁面、搜新內容。
- home-error 的錯誤卡：標題、原因、「收藏與瀏覽紀錄都沒有變動」的安撫句、重新載入按鈕。
- import-progress 的進度條、步驟計數（0/3）與就近的停止按鈕，匯入中停用登出。
- overview-dark 的深色外觀：卡片、長條、分段控制都有對應的深色值，不是單純反相。
- recap mobile 把表格改成卡片，是真正的行動版版面。
- entry-signed-out 的登入卡加四張功能卡，以及反覆出現、措辭一致的隱私說明。

最重要的五個問題（由嚴重到輕微）：
1. [資訊密度] [bookmarks] [desktop] 每筆收藏約 117px，右側三顆一樣的按鈕在 12 筆中重複，「私人」浮在卡片中段 —— 一屏只看得到約 8 筆，掃視效率低，重複按鈕也是視覺雜訊 —— 改成緊湊列（標題＋網址一行、分類標籤＋次數一行），動作在滑過或聚焦時才出現或收進「更多」，「私人」改成標題旁的鎖頭小徽章。
2. [色彩] [overview-dark、home] [兩者] 本週回顧卡在淺色是蜜桃底、在深色是褐色大區塊，是系統外的唯一暖色 —— 深色模式下顯得髒，也搶走主要內容的焦點 —— 改用靛紫系的淡色底（深色用低飽和靛藍），或改成一般卡片加左側色條。
3. [文案] [home、overview-dark] [兩者] 同一動作在不同頁寫成「加到我的網址」和「加入我的網址」；導覽也同時有「我的入口」和「今日入口」 —— 使用者會以為是不同功能 —— 建立用詞表，統一動詞與頁名（例如頂部「我的入口」、側欄第一項「今天」）。
4. [資訊層級] [community-interests、community-friends] [兩者] 「未分類 69.7%」和多列 0% 空長條佔滿版面；「99% 分布相似度」沒有基準說明 —— 興趣分析看起來空洞，數字也讓人不安或誤解 —— 隱藏 0% 類別或摺疊起來，把「先校正 3 個最常用的網站」做成主要行動；相似度旁加一句說明「只比較已分類網站的比例」。
5. [無障礙] [overview-dark、bookmarks] [兩者] meta 灰字（「Arc • Default • Lin MacBook Air」、日期、「私人」）只有約 11–12px，對比偏低 —— 在深色與手機上難讀 —— 字級提高到 13px 以上，灰階對比至少 4.5:1，隱私狀態加上圖示。

## 組 C
總分：5.5 / 10
一句話總評：C 組功能完整、隱私說明詳盡，但視覺停在較舊的「框框加側欄」風格：深色外觀完全沒有作用（深色截圖與淺色逐位元相同），手機上有兩層導覽和橫向溢出，載入與錯誤狀態薄弱，還有多處英文或內部名稱外露。

| 項目 | 分數 | 證據（狀態 ID、尺寸、看到的事實） |
|---|---|---|
| 資訊層級 | 6 | home-dark desktop（實為淺色）：主欄的大標、搜尋、本週回顧層級可以，但右欄同時堆了快速搜尋、14 項功能選單、你的帳號，和頂部 7 項導覽搶注意力；entry-signed-out desktop：680px 寬的窄卡置中，對未登入訪客寫「歡迎回到自己的入口」，語氣不對。 |
| 字體排印 | 6 | help desktop：大段說明用約 12px 灰色小字、行長超過 70 字；history mobile：時間「2026/11/12 下 / 午10:20」在「下午」中間斷行；標題「Cloudflare Tunnel • Cloudflare Zero …」被截斷。 |
| 色彩 | 4.5 | entry-signed-out-dark、home-dark（mobile）、overview-dark、community-friends-dark 的截圖檔與淺色版完全相同（同一 md5），home-dark desktop 畫面也仍是淺色——深色外觀不存在；insights desktop 的進度條用和品牌藍灰無關的綠色；community-interests 的長條是深灰粗軌道配細綠填色，0% 的列看起來反而最「滿」；overview-error 的錯誤文字是淡鮭魚色，對比很低。 |
| 間距與版面 | 5.5 | 桌面內容寬約 1040px，主欄約 780px，1440 寬兩側大片空白；recap desktop：「頁面」欄的標題、網址、按鈕整列靠右對齊，左側約 400px 空白；history desktop：每筆紀錄下面的「整理這個連結」獨佔一列、「加入我的網址」又再獨佔一列靠右，一筆紀錄佔約 145px。 |
| 一致性 | 5.5 | tools desktop：「下載 JSON 備份」「下載私人書籤 RSS」用的是上傳（↑）圖示；檔案欄位是瀏覽器原生的英文「Choose File / No file chosen」；help-search desktop 的搜尋框聚焦時是橙褐色外框，和藍灰品牌色無關；import-progress desktop 的「停止匯入」浮在頁面標題上方左角，和進行中的表單分開。 |
| 資訊密度 | 5 | bookmarks desktop：每張收藏卡約 190px，5 顆按鈕（放進主題選集／開啟網址／編輯／建立分享連結／刪除）每筆都完整展開，2000px 只放得下約 8 筆；history-search desktop 每筆約 145px，同樣兩列動作重複。 |
| 導覽 | 5 | online mobile、tools mobile：頂部 7 項主導覽（3 列，約 290 CSS px）下面還有 11 項次導覽（3 列），第一屏約 540 CSS px 都是導覽，頁面標題要往下捲；dashboard-signed-out desktop／mobile：未登入時頂部仍列出我的入口、主題選集、瀏覽回顧、匯入與設定等私人區塊；community-account mobile：第 4 個分頁「分享」只剩圖示，文字被裁掉。 |
| 狀態與回饋 | 5.5 | overview-loading desktop／mobile：沒有任何載入提示，四個數字顯示「—」，下面的區塊全空；overview-error desktop：只有一行淡色錯誤字加底部深紅 toast，沒有「重試」按鈕；import-progress：只有「正在處理，請稍候…」，沒有進度條；優點是 bookmark-delete-undo desktop 的 toast「收藏已刪除；原分享連結已失效。」加上「復原收藏」，以及 history-no-results 的「找不到符合的紀錄」與下一步建議。 |
| 響應式 | 4.5 | recap mobile：「各連結的推估停留」表格沒有改版型，右緣「https://mail.googl」與按鈕被裁切，出現橫向溢出；所有 mobile：右欄（快速搜尋、你的帳號）掉到內容最後面；history mobile：時間斷在「下 / 午」之間。 |
| 文案 | 6 | overview desktop：「由 sky-fast 分類、sky-quality 解讀」外露內部模型名稱；recap 的「YOUR BROWSING RECAP」、settings 的「PRIVATE ACCESS」是英文眉標；import-done desktop「接受 3、拒收 0、未處理 0」像系統訊息；overview-empty 把「尚未記錄」「無可估算區間」用和數字一樣大的粗體放在統計格裡。 |
| 無障礙 | 5.5 | overview-error 的淡鮭魚色錯誤字對比不足；help desktop 的說明字約 12px 且是灰色；bookmarks desktop 的「刪除」和其他按鈕同樣式，危險操作只靠文字。好的一面：help-search 的焦點外框非常明顯，mobile 按鈕高度足夠。 |
| 信任與隱私 | 7 | community-account：「朋友可見名稱、分類比例與造訪總數；看不到網址、標題、裝置或個別時間」、同步金鑰的有效期與撤銷都有交代；community-shares：分享內容、不列入公開目錄、可隨時撤銷；import-confirm 的對話框寫明「共 3 筆，其中 0 筆會更新現有項目，1 筆會分享給已接受的朋友。匯入不會刪除其他收藏。」扣分：settings 已顯示「已連線」，卻仍要求「貼上你的存取金鑰」，讓人困惑；未登入時導覽列出私人區塊。 |

要保留的優點：
- import-confirm 對話框：明確寫出筆數、會更新幾筆、幾筆分享給朋友、不會刪除其他收藏，「開始匯入」為主按鈕。
- bookmark-delete-undo：刪除後的 toast 同時說明副作用（原分享連結已失效），並提供「復原收藏」。
- community-account／community-shares 的隱私邊界說明非常具體（朋友看得到什麼、看不到什麼、快照與撤銷）。
- history-no-results 的空結果：標題、建議（換關鍵字、切換日期、從擴充功能同步）、清除搜尋按鈕。
- help-search 搜尋框的高對比焦點外框與「找到 5 個說明主題」結果數。

最重要的五個問題（由嚴重到輕微）：
1. [色彩] [entry-signed-out-dark、home-dark、overview-dark、community-friends-dark] [兩者] 深色外觀完全沒有作用：多組深色截圖與淺色逐位元相同，home-dark desktop 也仍是淺色 —— 晚上使用刺眼，也代表顏色沒有 token 化 —— 建立淺／深兩組色彩 token（背景、表面、邊框、文字、主色、語意色），所有元件改用 token。
2. [響應式] [recap] [mobile] 「各連結的推估停留」表格沒有行動版版型，網址與按鈕被裁在右緣，造成橫向溢出 —— 手機上主要資料讀不到、按不到 —— 小於 640px 時改成卡片（標題、網址、停留時間、次數、動作）。
3. [導覽] [online、tools、bookmarks 等入口頁] [mobile] 頂部 7 項加次導覽 11 項全部攤開，約 540 CSS px 才看到頁面標題；未登入時（dashboard-signed-out）還列出私人區塊 —— 手機第一屏沒有內容，訪客也會點進看不到的頁面 —— 主導覽收成「選單」按鈕，次導覽改成可橫向捲動的單列；未登入只顯示首頁與使用說明。
4. [狀態與回饋] [overview-loading、overview-error、import-progress] [兩者] 載入時只顯示「—」和空區塊；錯誤只有淡色字和 toast，沒有重試；匯入中沒有進度條，停止按鈕浮在標題上方 —— 使用者分不清是載入中、沒資料還是壞了 —— 加入骨架或明確的載入文字；錯誤改用帶「重試」按鈕的區塊卡；匯入改用進度條與「n/N」，停止按鈕放在進度旁。
5. [文案] [overview、recap、settings、tools、import-done] [desktop] 外露「sky-fast」「sky-quality」、英文眉標「YOUR BROWSING RECAP」「PRIVATE ACCESS」、原生「Choose File」、「接受 3、拒收 0、未處理 0」 —— 混雜內部術語與英文，降低可信度 —— 改為「AI 依標題與網址整理」、刪掉英文眉標、自訂中文檔案按鈕，結果改寫成「已匯入 3 筆，沒有失敗」。

```json
{"A": {"overall": 6.5, "scores": {"資訊層級": 7.5, "字體排印": 7, "色彩": 7, "間距與版面": 7, "一致性": 6.5, "資訊密度": 7, "導覽": 6.5, "狀態與回饋": 5, "響應式": 7, "文案": 7, "無障礙": 5.5, "信任與隱私": 6}, "issues": ["arena-explore desktop：整排卡片只顯示「Loading」，沒有骨架", "arena-explore desktop：用檔名或 hash 當卡片標題", "linkding-demo 兩者：View/Edit/Archive/Remove 是很小的灰色文字連結，Remove 沒有危險色", "arena-channel mobile：底部浮動的登入列遮住卡片標題", "arena-channel desktop：Info 欄 meta 淡出到看不清，縮圖是整頁截圖縮小"]}, "B": {"overall": 8, "scores": {"資訊層級": 8.5, "字體排印": 8, "色彩": 8, "間距與版面": 8, "一致性": 8, "資訊密度": 7.5, "導覽": 8, "狀態與回饋": 8.5, "響應式": 8, "文案": 7.5, "無障礙": 7.5, "信任與隱私": 8.5}, "issues": ["bookmarks desktop：每筆約 117px，三顆按鈕重複，「私人」浮在卡片中段，密度偏低", "overview-dark／home：本週回顧卡的蜜桃／褐色底在系統外，深色下顯髒", "home／overview-dark：「加到我的網址」與「加入我的網址」並存，「我的入口」與「今日入口」並存", "community-interests／friends：未分類 69.7% 加多列 0% 空長條，「99% 分布相似度」沒有說明", "overview-dark／bookmarks：meta 灰字約 11–12px，對比偏低"]}, "C": {"overall": 5.5, "scores": {"資訊層級": 6, "字體排印": 6, "色彩": 4.5, "間距與版面": 5.5, "一致性": 5.5, "資訊密度": 5, "導覽": 5, "狀態與回饋": 5.5, "響應式": 4.5, "文案": 6, "無障礙": 5.5, "信任與隱私": 7}, "issues": ["多個 *-dark 狀態：深色截圖與淺色逐位元相同，深色外觀沒有作用", "recap mobile：推估停留表格橫向溢出，網址與按鈕被裁切", "入口頁 mobile：兩層導覽約佔 540 CSS px；未登入時仍列出私人區塊", "overview-loading／error、import-progress：沒有載入提示、沒有重試、沒有進度條", "overview／recap／settings／tools：外露 sky-fast、英文眉標、Choose File、系統式結果訊息"]}}
```
