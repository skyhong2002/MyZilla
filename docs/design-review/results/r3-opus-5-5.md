# r3 blind review: Claude Opus 5.5 (effort high)

- Date: 2026-11-13
- Brief: `brief.md`, SHA-256 `9fe8f7b60e39b420dc1e9f208fe60068e37ae097560109a4805747f6296cc24b`
- Reviewer: claude-proxy `claude-opus-5-5`, effort high, fresh session with no other context
- Mapping (revealed after the review): **B = new** (commit `3125890`, round-2 fixes), **C = reference**, **A = baseline** (`main` at `5d8ab8c`)

Raw reviewer output below, unedited.

---

## 組 A
總分：5 / 10
一句話總評：功能齊全、資訊也算完整，但視覺停在舊式入口網站（淺藍底、粗色帶導覽、右側三個框）；深色外觀根本沒有生效，錯誤狀態做得半套，手機版在內容出現前先塞了一大段導覽。

| 項目 | 分數 | 證據（狀態 ID、尺寸、看到的事實） |
|---|---|---|
| 資訊層級 | 6 | home desktop：「今天，從這裡開始。」標題加上搜尋列，主次清楚；但右欄「快速搜尋／功能選單／你的帳號」三個框和主欄搶注意力，畫面上同時有兩個搜尋框（主欄搜尋列＋右欄快速搜尋）。entry-signed-out desktop：產品介紹放在置中窄卡裡，左右大片留白，「帳號登入」是唯一的主按鈕，還算清楚。 |
| 字體排印 | 5.5 | overview desktop：數字（3,240、11 小時 44 分）很醒目，但說明字小約 11px 且灰（「前景時間由擴充功能記錄…」）；bookmarks desktop：卡片裡的 meta「1 次開啟・最近 2026/11/13 上午2:40:49」連秒數都顯示，又小又密。overview-error desktop：錯誤訊息是淡橘色小字，幾乎看不見。 |
| 色彩 | 4.5 | home-dark／overview-dark／entry-signed-out-dark／community-friends-dark（desktop、mobile）：截圖平均亮度和淺色版完全相同（例如 home 243.75 = home-dark 243.75），深色外觀等於不存在。淺色版是淺藍底配深藍主色，導覽色帶是灰藍（#b7cfdc 左右），對比偏悶，語意色只在錯誤 toast 用了暗紅。 |
| 間距與版面 | 5.5 | links desktop：主欄只有約 780px，右欄 235px，1440 寬裡左右各空出約 200px，內容只有兩張短網址卡，大片空白。bookmarks desktop：每張卡片高約 190px，按鈕列和 meta 間距一致，但整體像表單堆疊。 |
| 一致性 | 5.5 | overview desktop 的期間切換是四顆獨立方框按鈕（選中為深藍實心），其他頁的切換和頁籤用的是底線；「私人」標籤在 overview 是小框，在 bookmarks 是右上角灰字。overview desktop 最近看過頁面的「整理這個連結」掉到列外、「加入我的網址」又被擠到下一行右側，同一列的操作被拆開。 |
| 資訊密度 | 5.5 | bookmarks desktop：2400px 高只放得下約 8 筆網址，每筆都有 5 顆按鈕（放進主題選集／開啟網址／編輯／建立分享連結／刪除）。home mobile：常用收藏改成兩欄大方卡，每張約 170 CSS px 高，八個書籤就佔掉將近一屏半。 |
| 導覽 | 5 | home mobile：頂部導覽色帶換成三列，下面又接三列文字連結（今日入口…匯入與工具），標題「今天，從這裡開始。」要到約 290 CSS px 才出現。desktop 主導覽和右欄「功能選單」兩套，目前位置只用底線＋淡底色標示。 |
| 狀態與回饋 | 4.5 | home-error desktop：頂部橫幅和底部紅色 toast 重複顯示「伺服器暫時無法處理，請稍後重試。」，卡片裡卻仍是載入中的骨架條，而且沒有重試按鈕。overview-error desktop：數字全變成「—」，經常造訪的網站和最近看過的頁面整區空白，沒有重新載入的入口。 |
| 響應式 | 5 | home mobile：導覽換行成六列，佔掉大半屏；home-loading mobile、home-error mobile 截圖高度（2452／2556）比 B 對應狀態（1688）長得多，表示手機版在錯誤或載入時仍保留整套右欄框。桌面只是窄欄置中，沒有善用寬螢幕。 |
| 文案 | 5.5 | overview desktop 本週回顧底下寫著「由 sky-fast 分類、sky-quality 解讀，只依標題與網址推測」，內部模型代號直接外露。其他用詞大致自然，例如 links desktop「從收藏的『建立分享連結』產生…刪除收藏、撤銷或到期後失效。」 |
| 無障礙 | 4.5 | overview-error desktop：錯誤文字是淡橘色配淺藍底，對比明顯不足；bookmarks desktop：按鈕文字約 11px；導覽目前位置只靠細底線區分。深色外觀缺席，對需要深色的使用者沒有替代。 |
| 信任與隱私 | 6 | entry-signed-out desktop：明說「瀏覽歷史、收藏與搜尋紀錄預設只有本人可見，登入後才會顯示」；bookmarks desktop 每筆都標「私人」。但 overview 頁外露內部模型代號，錯誤狀態也不說資料是否完好，會讓人不安。 |

要保留的優點：
- home desktop 的「今天，從這裡開始。」搭配單一搜尋列（可選「我的瀏覽紀錄」），入口意圖清楚。
- 本週回顧卡片把 AI 摘要壓成三個重點加「值得繼續」，好讀。
- entry-signed-out desktop 的「認識 MyZilla」用四點條列說明四大功能，並交代隱私預設。
- links desktop 的短網址卡片寫出開啟次數與到期時間，並提供「撤銷連結」。
- overview desktop 的「經常造訪的網站」用編號加長條，排名一眼就看得出來。

最重要的五個問題（由嚴重到輕微）：
1. [色彩] [home-dark、overview-dark、entry-signed-out-dark、community-friends-dark] [兩者] 深色狀態的截圖和淺色版完全一樣，深色外觀沒有生效 —— brief 把深色列為必測狀態，夜間使用者會被刺眼的白底干擾 —— 用色彩 token 實作 prefers-color-scheme 與手動切換，並檢查每頁。
2. [狀態與回饋] [home-error、overview-error] [兩者] 錯誤時骨架條或「—」留在畫面上，訊息重複出現（橫幅＋toast），沒有重試按鈕 —— 使用者分不清是還在載入還是已經失敗，也不知道下一步 —— 把錯誤收成一個區塊：說明原因、保證資料沒有變動，附「重新載入」。
3. [導覽／響應式] [home、bookmarks 等所有登入頁] [mobile] 主導覽換行成三列，再加三列次級連結，內容被推到首屏中段 —— 手機上每頁都要先捲過導覽 —— 主導覽改成可橫向捲動的單列，次級導覽收進頁內頁籤或選單。
4. [文案／信任] [overview] [desktop] 「sky-fast 分類、sky-quality 解讀」這類內部代號外露 —— 一般使用者看不懂，也會懷疑資料被送去哪裡 —— 改成「AI 只依頁面標題與網址整理，不讀內文」這類白話說明。
5. [資訊密度／一致性] [bookmarks、home] [兩者] 每筆網址都常駐 5 顆小按鈕、時間顯示到秒，右欄重複一個快速搜尋 —— 掃讀很慢，畫面雜亂 —— 次要操作收進「更多」選單，時間只到分鐘，移除重複的搜尋。

## 組 B
總分：7.5 / 10
一句話總評：一套成熟、乾淨、淺色與深色都成立的設計系統，狀態處理和隱私說明是三組最好的；剩下的問題是列表操作太重複、手機導覽靠橫向捲動又沒有提示，還有少數用詞偏內部。

| 項目 | 分數 | 證據（狀態 ID、尺寸、看到的事實） |
|---|---|---|
| 資訊層級 | 7.5 | home desktop：日期（藍色小字）→「今天，從這裡開始。」→ 搜尋列 → 本週回顧（暖色底）→ 常用收藏，順序合理；本週回顧用淡橘底和其他白卡區隔。overview desktop：本週回顧 → 線索 → 四個數字 → 排行 → 最近頁面。不過 overview 首屏被本週回顧大卡和三張線索卡佔滿，核心數字落到約 860px 才出現。 |
| 字體排印 | 7.5 | overview desktop：數字用粗大字級（3,240、11 小時 44 分），說明為灰色小字，層級清楚；history mobile：長標題（「Streaming response stalls behind Cloudflare Tunnel・Issue #3921・honojs/hono」）換成三行，網址以單行省略號截斷；recap mobile：長網址（ptt.cc/…M.1730000000.A.123.html）完整斷行，沒有溢出。 |
| 色彩 | 8 | overview-dark、home-dark、community-friends-dark（兩者）：深色背景約 #16171c，卡片稍亮，主色紫藍換成亮紫，本週回顧換成深咖啡底，都成立。語意色一致：import-done 用綠色成功橫幅、home-error／overview-error 用淡紅底紅字、「移除朋友」「婉拒」「刪除」都是紅色。 |
| 間距與版面 | 7.5 | bookmarks desktop：左欄分組導覽（整理／收藏／更多）約 190px，主欄約 920px，對齊乾淨；settings desktop 三步驟卡等寬排列。不過 overview-error desktop、home-error desktop 在 900 高的畫面中只有一個錯誤區塊，下方全空；help desktop 內容欄只有約 760px，右側留下大片空白。 |
| 一致性 | 8 | 各頁都用同一組元件：白卡＋淡框＋12px 圓角、灰框次要按鈕、紫色實心主按鈕（新增網址、送出朋友邀請、建立分享連結），頁籤都是底線＋紫字，「私人」綠色徽章在 overview／insights／settings 一致。小瑕疵：dashboard-signed-out 的「解鎖回顧 ↗」用了外部連結箭頭，但它不是外連。 |
| 資訊密度 | 6.5 | history desktop：每列都重複「整理這個連結」「加入我的網址」，2400px 只放 21 筆；history mobile：每筆約 130 CSS px，一屏約 5 筆，按鈕和日期各佔一行。bookmarks desktop：每張卡片常駐 5 顆操作，2400px 約 11 筆。community-interests desktop：五個 0% 類別也各佔一整列長條。 |
| 導覽 | 7 | desktop：頂部主導覽加左側分組次導覽，目前位置用紫底標示（bookmarks「我的網址」）；瀏覽回顧內有總覽／洞察／歷史／回顧頁籤和期間切換。mobile（import-progress、overview 等）：主導覽和次導覽都是橫向捲動的膠囊列，右緣「匯入…」被裁掉，只靠裁切暗示還能捲，而且兩列合計約 160 CSS px。 |
| 狀態與回饋 | 8 | home-error desktop：「暫時讀不到你的入口」＋原因＋「收藏與瀏覽紀錄都沒有變動」＋「重新載入」主按鈕；overview-loading desktop：上方有「正在讀取你的瀏覽紀錄…」，下面是骨架卡；overview-empty desktop：每區都有空狀態說明，並給「前往匯入與設定 →」；history-no-results：「找不到符合的紀錄」＋三個建議＋清除搜尋；import-done：「接受 3、拒收 0、未處理 0」＋「查看我的網址」。缺點：import-progress 只有「匯入進度 0/3」文字，沒有進度條。 |
| 響應式 | 7 | settings mobile：三步驟卡改成直排，來源列表數量換到第二行；community-friends mobile：邀請輸入框和按鈕改成上下排列；recap mobile：表格改成卡片（「推估停留 13 分 54 秒・有效區間 8」）。但頂部導覽靠橫向捲動又被裁切，overview-error mobile 的「重新載入」按鈕和錯誤文字擠在同一行，文字斷在「變／動」。 |
| 文案 | 7.5 | 大多自然而精準：overview「AI 只依頁面標題與網址推測整理，不讀頁面內文；每天 08:00 有新紀錄時更新」；community-account「朋友可見名稱、分類比例與造訪總數；看不到網址、標題、裝置或個別時間」。偏內部的用詞：insights 卡片徽章「規則線索」「標題關鍵詞」、recap 的「有效區間」、settings 的「Zen・工作」重複兩列（一列 1,408 筆時間區間、一列 186 筆造訪），一般人看不懂差別。 |
| 無障礙 | 7 | help-search desktop：輸入框聚焦時有明顯的紫色粗框；按鈕大多有圖示加文字，危險操作除了紅色還有垃圾桶圖示。但 overview desktop 的 meta（「Arc・Default・Lin MacBook Air」）和時間戳是約 11px 淺灰字；history desktop 的「加入我的網址」是約 12px 的底線連結，點擊範圍小。 |
| 信任與隱私 | 8 | 每個回顧頁都有綠色「私人」徽章和「已連線・所有資料來自你的私人伺服器」；dashboard-signed-out：「金鑰只保留在此分頁工作階段」；community-shares：分享前說明「包含顯示名稱、全部造訪總數、分類次數與比例，沒有網站清單、原始網址或標題」。缺點：community-shares 的「有效分享」只列「到期：2026/11/20 上午02:40」，看不到連結本身、建立時間或複製按鈕。 |

要保留的優點：
- 錯誤狀態的寫法（home-error、overview-error）：說明原因，保證「收藏與瀏覽紀錄都沒有變動」，附重新載入按鈕。
- 深色外觀（overview-dark、home-dark、community-friends-dark）完整成立，語意色在深色下也看得清楚。
- 隱私與分享範圍文案（community-account、community-shares、overview 的 AI 說明）具體列出朋友「看得到／看不到」的內容。
- 匯入流程（import-confirm → progress → done）三步驟清楚，完成時有筆數與「查看我的網址」的下一步。
- 桌面兩層導覽：頂部主區加左側分組（整理／收藏／更多），目前位置用紫底標示。
- recap mobile 把表格改成卡片，而不是硬塞橫向表格。

最重要的五個問題（由嚴重到輕微）：
1. [導覽／響應式] [所有登入頁，例如 import-progress、overview、community-account] [mobile] 主導覽和次導覽都是橫向捲動膠囊列，右緣項目被裁切，沒有捲動提示，兩列合計約 160 CSS px —— 使用者可能找不到「匯入與設定」「帳號與朋友」，每頁也要先捲過導覽 —— 改成底部分頁列或「更多」選單；次導覽只在需要的區塊出現，或收成下拉。
2. [資訊密度] [history、history-search、overview（最近看過的頁面）、bookmarks] [兩者] 每列都重複「整理這個連結／加入我的網址」或 5 顆操作按鈕，手機一屏只有約 5 筆 —— 瀏覽歷史本來就是要快速掃讀，重複按鈕會稀釋內容 —— 改成懸停或選取後才出現操作，或收成單一「⋯」選單；手機版把日期和來源併成一行。
3. [信任與隱私] [community-shares] [兩者] 「有效分享」只顯示到期時間，看不到連結、建立日期、內容摘要，也沒有複製按鈕 —— 使用者無法確認自己分享出去的到底是哪一條連結 —— 列出連結（可複製）、建立時間、有效期，以及「預覽對方看到的內容」。
4. [文案] [insights、recap、settings] [兩者] 「規則線索」「標題關鍵詞」「有效區間」，還有兩列同名的「Zen・工作」 —— 使用者看不懂分類依據和來源差別 —— 改成白話（例如「依網站規則判斷」「依標題字詞判斷」），來源列加上資料類型標題，並合併同名來源。
5. [狀態與回饋／間距] [import-progress、overview-error、home-error] [兩者] 匯入進度只有「0/3」文字，沒有進度條；錯誤頁除了一個區塊外整頁空白，也沒保留上次的資料 —— 長時間匯入時無法判斷是否卡住；錯誤時使用者什麼都做不了 —— 加入進度條和預估剩餘；錯誤時保留上次成功的資料，並標示「顯示的是上次結果」。

## 組 C
總分：7 / 10
一句話總評：參考組由三個產品組成（Raindrop 行銷首頁、linkding 書籤列表、Are.na 頻道／探索），各自在自己的定位上成熟；但截圖只有一般狀態，沒有載入、錯誤或深色可以比較，而且 linkding 很密，Are.na 的縮圖幾乎讀不出內容。

| 項目 | 分數 | 證據（狀態 ID、尺寸、看到的事實） |
|---|---|---|
| 資訊層級 | 7.5 | raindrop-home desktop：「All-in-one bookmark manager」大標＋副標＋「Sign up」主按鈕，右邊是產品截圖，一眼就懂。linkding-demo desktop：左邊書籤列表、右邊 Bundles／Tags，主次清楚。arena-channel desktop：麵包屑標題「Are.na / Are.na Editorial / Are.na Blog」很大，但下方 Info 區的文字被淡出遮罩切掉（「Counts」「Connect」只剩半透明）。 |
| 字體排印 | 7.5 | raindrop-home desktop：無襯線大標與內文對比強烈，行長控制在約 560px；linkding-demo desktop：標題藍、tag 綠、描述黑、meta 灰，四層字色分明，描述以單行「…」截斷；arena-channel desktop：卡片縮圖裡的文章文字小到無法閱讀，只能靠下方標題。 |
| 色彩 | 7 | raindrop：藍色主色加柔和插畫色塊，品牌鮮明；linkding：紫色主按鈕「Add bookmark」，tag 用青綠色，系統一致但偏工具感；Are.na：近乎黑白，讓內容自己帶顏色。截圖裡沒有深色或語意色（成功／錯誤）可以評估。 |
| 間距與版面 | 7 | linkding-demo desktop：主欄約 630px、側欄約 300px，置中後左右各空出約 230px；raindrop 行銷頁有大量留白和斜切插畫，節奏好；arena-channel desktop 四欄格線整齊，縮圖等高。 |
| 一致性 | 7 | 單一產品內各自一致：linkding 每列都是「時間｜View Edit Archive Remove｜Notes」；Are.na 卡片都是縮圖＋標題＋連結圖示。三個產品之間本來就不同，這組不比跨產品的一致性。 |
| 資訊密度 | 7 | linkding-demo desktop：2400px 約 29 筆，三行一筆，密度高但一致；linkding-demo mobile：每筆四行，一屏約 7 筆；arena-channel desktop：一屏約 16 張縮圖，但縮圖內容讀不到，有效資訊偏少。 |
| 導覽 | 7 | linkding-demo mobile：頂部收成「＋」和漢堡選單，搜尋列旁邊多一顆「Filters」，取代桌面側欄的 tags，效率好；arena-channel desktop：麵包屑加 Grid／Table 切換；raindrop 行銷頁只有頂部五個連結加 Login。 |
| 狀態與回饋 | 5 | 八張截圖都是一般有資料的狀態，看不到載入、空資料、錯誤、刪除復原或對話框，沒有證據可以給高分；linkding 的動作都是文字連結（Remove 沒有確認的視覺線索）。 |
| 響應式 | 7.5 | linkding-demo mobile：側欄移除、改成 Filters 按鈕，描述保持單行截斷，沒有橫向溢出；raindrop-home mobile 和 arena 的手機版都是單欄重排。 |
| 文案 | 7.5 | raindrop：「Intuitive. Powerful. Runs everywhere」「Designed for creatives, built for {coders}」，品牌語氣明確；linkding：用詞簡短精準（Add bookmark、Archive、Remove）；描述欄直接顯示原始 Markdown（「[OwnTracks](https://owntracks.org/)」），是系統文字外露。 |
| 無障礙 | 6 | linkding-demo desktop：「View Edit Archive Remove」是約 12px 灰色文字連結，彼此間距小，點擊範圍很小；arena-channel desktop：Info 區被淡出切掉的文字對比極低；raindrop 主按鈕對比好。 |
| 信任與隱私 | 6.5 | raindrop-home：清楚的登入／註冊入口和產品說明，但截圖裡沒有隱私說明；linkding-demo 是公開示範站，所有書籤和 Logout 都暴露在外；Are.na 頻道是公開內容。三者都沒有私人資料或分享範圍的設計可以參考。 |

要保留的優點：
- raindrop-home 的首屏：一句大標、一句副標、一個主按鈕加真實產品截圖，價值主張很快傳達。
- linkding-demo 的列表：標題、tag、描述、操作四層字色分明，描述以單行截斷，掃讀快。
- linkding-demo mobile 把桌面側欄改成「Filters」按鈕，導覽不佔首屏。
- arena-channel 的 Grid／Table 檢視切換，讓同一份內容有兩種密度。

最重要的五個問題（由嚴重到輕微）：
1. [狀態與回饋] [全部] [兩者] 截圖只有一般狀態，沒有載入、空資料、錯誤、刪除復原 —— 無法驗證關鍵流程的回饋品質 —— 作為參考時只能借鑑版面與列表，不能借鑑狀態設計。
2. [無障礙] [linkding-demo] [兩者] 「View Edit Archive Remove」是小字灰色文字連結，間距很近，Remove 和 Archive 緊貼 —— 容易誤點，觸控也不友善 —— 危險操作和一般操作分開，加大點擊區。
3. [字體排印／資訊密度] [arena-channel] [desktop] 縮圖是整頁截圖縮小，裡面的文字無法閱讀 —— 有效資訊只剩一行被截斷的標題 —— 改用文章主圖或摘要文字卡。
4. [文案] [linkding-demo] [兩者] 描述欄直接顯示原始 Markdown 語法 —— 系統格式外露，降低質感 —— 渲染 Markdown，或去除語法後再截斷。
5. [資訊層級] [arena-channel] [desktop] Info 區用淡出遮罩截斷，「Counts」和「Connect」半透明、看不清楚 —— 使用者不知道下面還有內容，也不知道怎麼展開 —— 用明確的「展開」按鈕取代淡出。

```json
{"A": {"overall": 5, "scores": {"資訊層級": 6, "字體排印": 5.5, "色彩": 4.5, "間距與版面": 5.5, "一致性": 5.5, "資訊密度": 5.5, "導覽": 5, "狀態與回饋": 4.5, "響應式": 5, "文案": 5.5, "無障礙": 4.5, "信任與隱私": 6}, "issues": ["深色外觀未生效：home-dark、overview-dark、entry-signed-out-dark、community-friends-dark 的截圖與淺色版完全相同", "錯誤狀態不完整：home-error、overview-error 留著骨架或「—」，訊息重複（橫幅＋toast），沒有重試按鈕", "手機導覽佔據首屏：主導覽換行三列，再加三列次級連結，內容被推到中段", "overview 外露內部模型代號「sky-fast 分類、sky-quality 解讀」", "列表過重：每筆網址常駐 5 顆小按鈕、時間精確到秒，右欄重複一個快速搜尋"]}, "B": {"overall": 7.5, "scores": {"資訊層級": 7.5, "字體排印": 7.5, "色彩": 8, "間距與版面": 7.5, "一致性": 8, "資訊密度": 6.5, "導覽": 7, "狀態與回饋": 8, "響應式": 7, "文案": 7.5, "無障礙": 7, "信任與隱私": 8}, "issues": ["手機主導覽與次導覽都是橫向捲動膠囊列，右緣被裁切，沒有捲動提示，合計約 160 CSS px", "歷史與收藏列表每列重複「整理這個連結／加入我的網址」或 5 顆操作，手機一屏約 5 筆", "community-shares 的有效分享只顯示到期時間，沒有連結本身、建立時間或複製按鈕", "內部用詞：「規則線索」「標題關鍵詞」「有效區間」，settings 有兩列同名的「Zen・工作」", "匯入進度只有「0/3」文字、沒有進度條；錯誤頁整頁空白，也沒保留上次資料"]}, "C": {"overall": 7, "scores": {"資訊層級": 7.5, "字體排印": 7.5, "色彩": 7, "間距與版面": 7, "一致性": 7, "資訊密度": 7, "導覽": 7, "狀態與回饋": 5, "響應式": 7.5, "文案": 7.5, "無障礙": 6, "信任與隱私": 6.5}, "issues": ["截圖只有一般狀態，看不到載入、空資料、錯誤與復原", "linkding 的 View/Edit/Archive/Remove 是小灰字連結，點擊範圍小，危險操作緊鄰一般操作", "Are.na 縮圖是整頁截圖縮小，內文無法閱讀", "linkding 描述欄顯示原始 Markdown 語法", "Are.na Info 區以淡出遮罩截斷，「Counts」「Connect」看不清楚，也沒有明確的展開操作"]}}
```
