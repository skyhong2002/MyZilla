import "./style.css";
import "./classic.css";
import "./community.css";
import { installUX, focusHeading } from "./ux";
const root = document.getElementById("help")!;
root.innerHTML = `<a class="skip-link" href="#help-main">跳到主要內容</a><header class="site-header"><a class="brand" href="/"><img class="brand-logo" src="./myzilla-mark.svg" width="48" height="36" alt=""><strong>MyZilla</strong></a><nav class="site-nav" aria-label="主要導覽"><a href="/">我的入口</a><a href="/#collections">主題選集</a><a href="/dashboard.html">瀏覽回顧</a><a href="/dashboard.html#settings">匯入與設定</a><a href="/community.html">帳號與朋友</a><a href="/help.html" aria-current="page">使用說明</a></nav></header>
<main id="help-main" tabindex="-1" class="site-main community-main"><h1>使用說明</h1><p>從登入、找回頁面，到整理與分享你的收藏。</p><label>搜尋說明<input id="help-search" type="search" placeholder="例如登入、時間、分享"></label><p id="help-status" role="status"></p><nav class="page-nav" aria-label="說明主題"><a href="#login">登入</a><a href="#import">匯入與同步</a><a href="#history">找回頁面</a><a href="#insights">洞察</a><a href="#time">停留時間</a><a href="#collections">收藏</a><a href="#sharing">朋友與分享</a><a href="#trouble">遇到問題</a></nav>
<section id="login" class="community-section"><h2>登入自己的空間</h2><ol><li>到<a href="/community.html">帳號與朋友</a>，輸入既有帳號與密碼。</li><li>第一次使用且持有部署時提供的存取金鑰：使用金鑰登入，開啟既有空間後建立擁有者帳號。原有歷史會保留。</li><li>想用 Google 登入：先登入原帳號，在帳號頁按「連結 Google 帳號」完成一次連結；之後就能使用 Google 登入。</li></ol><p>新朋友需要站主提供的一次性邀請碼，註冊後會有自己的空間，不會取得你的歷史。存取金鑰相當於密碼，請勿分享。</p><p>登入只保留在目前分頁。登入過期時，編輯中的表單會保留，可在彈出視窗用原帳號密碼或原始金鑰重新登入，再送出操作。</p></section>
<section id="import" class="community-section"><h2>匯入舊歷史，持續記錄新活動</h2><ol><li>前往<a href="/dashboard.html#settings">匯入與設定</a>，下載適合瀏覽器的擴充功能，依頁面步驟安裝。</li><li>每個瀏覽器設定檔各自安裝並連接自己的伺服器與同步金鑰。Chrome、Brave、Arc、Dia 使用 Chromium 版本；Zen 使用 Firefox 版本。</li><li>匯入這個設定檔的舊歷史可按「匯入本設定檔全部歷史」。需要多瀏覽器、所有設定檔完整匯入時，下載<a href="/downloads/import_history.py">原生匯入工具</a>，依<a href="/downloads/import-contract.md">匯入步驟</a>操作。</li></ol><p>沒有日期或筆數上限；工具支援重送與續傳。擴充功能只能讀取自身設定檔，不能替其他瀏覽器匯入。匯入後在設定頁的來源清單核對瀏覽器、設定檔與筆數。</p><p>既有歷史沒有前景時間；開啟擴充功能記錄後才會累積。更換同步金鑰後，所有設定檔都需要更新。</p></section>
<section id="history" class="community-section"><h2>找回看過的文章</h2><ol><li>前往<a href="/dashboard.html#history">瀏覽回顧 → 歷史</a>。</li><li>選擇期間；若找不到很久以前的文章，切換「全部」。</li><li>輸入標題片段或網址，使用上一頁／下一頁瀏覽全部結果。</li></ol><p>清除搜尋不會刪除任何歷史。按 <kbd>/</kbd> 可跳到目前頁面的搜尋欄；編輯文字時不會觸發。長頁可用右下方「回到頂部」。</p></section>
<section id="insights" class="community-section"><h2>讀懂五個洞察面向</h2><p>到<a href="/dashboard.html#insights">洞察</a>，選擇興趣地圖、探索路徑、近期變化、興趣交集或長期線索。各面向保留自己的頁碼。</p><ul><li>興趣地圖：跨日期重複出現的內容，可展開「查看依據」核對頁面，或「調整這個主題」改名、標記工作需要、排除不準的分類。</li><li>探索路徑：依時間相鄰的相關活動整理，不代表一定由前一頁點到下一頁。</li><li>近期變化：比較兩段期間的內容占比。同一頁同一天只計一次，例如 2 頁在 3 天都出現，共 6 個「頁面 × 天數」。</li><li>興趣交集：同一頁面共同出現的主題。</li><li>長期線索：跨月回訪的內容，幫你找回反覆用到的頁面。</li></ul><p>分析依標題與網址，可能分類不準；不推論人格。「我的主題調整」可以恢復自動判斷。選「全部」時，近期變化以最後一筆資料為基準，不一定是今天。</p></section>
<section id="time" class="community-section"><h2>前景時間與歷史推估有什麼不同？</h2><p><strong>前景時間</strong>由擴充功能記錄；<strong>歷史推估</strong>則將同一裝置、瀏覽器、設定檔的相鄰造訪間隔，歸給前一個網址。兩者分開呈現，不相加。</p><p>例如 10:00 開啟 A，10:02 開啟 B：選「小於 3 分鐘」時，A 得到 2 分鐘；選「小於 1 分鐘」則不納入。剛好等於門檻、間隔更長、沒有下一筆的紀錄都不補時間。</p><p>多分頁、閒置或不同設定檔重疊都會造成誤差，因此這不是實際閱讀時長。在<a href="/dashboard.html#recap">回顧 → 留下的時間</a>可切換門檻、搜尋連結、查看未納入的紀錄。</p></section>
<section id="curation" class="community-section"><h2>從看過的內容，整理成主題選集</h2><p>首頁的關注線索可以「挑選相關頁面」；瀏覽歷史、洞察依據、時間推估與原有收藏也能直接整理連結。先放進「待整理」，或加入一份選集。</p><p>待整理可先保留、略過或復原；這些操作不刪除原始瀏覽紀錄。選集可編排順序、補上介紹與每篇的推薦理由。指定朋友可以共同加入與編輯，只有建立者能修改分享設定或發布快照。</p><p>「預覽與分享」會顯示實際公開的標題、網址與筆記；產生 1／7／30 天有效的快照連結。後續編輯不會更新已發布的快照。封存會撤銷連結和共同編輯權限；可從已封存清單復原為私人選集。</p><p>擴充功能的「挑選開啟的分頁」能把選取的分頁送到待整理；Chromium 可依群組挑選，Firefox／Zen 可逐頁挑選。不會自動上傳全部分頁或關閉原分頁。</p><a href="/#inbox">開始整理 →</a> · <a href="/#collections">我的選集 →</a></section><section id="collections" class="community-section"><h2>整理、備份與復原收藏</h2><p>在<a href="/#bookmark">我的入口</a>新增網址、網摘、電影或心情，並用生活分類、標籤和筆記整理。預設只有自己可見。</p><p>編輯後按「儲存」。取消或離開未儲存的表單會詢問是否放棄；按 Esc 可關閉對話框。刪除收藏前會確認，刪除通知上的「復原收藏」可在 10 分鐘內還原；原分享連結不會恢復。關閉通知後也可到「匯入與工具 → 最近刪除的收藏」復原。</p><p>到<a href="/#tools">匯入與工具</a>下載 JSON 備份或私人 RSS。還原 JSON 前會顯示總筆數、將更新的項目及朋友可見筆數。相同 ID 更新內容、不新增重複項目；既有點閱統計保留。停止匯入會保留已完成部分，之後可重送。備份不包含瀏覽歷史、密碼及分享連結。</p></section>
<section id="sharing" class="community-section"><h2>朋友可以看見什麼？</h2><ul><li><strong>朋友可見的收藏：</strong>只有已接受的朋友能看見該項目的標題、網址、標籤與筆記。改回「只有自己」即停止分享。</li><li><strong>收藏分享連結：</strong>任何持有連結的人都可開啟該收藏的目標網址；不含私人筆記。到「短網址管理」撤銷。</li><li><strong>興趣摘要分享：</strong>包含顯示名稱、造訪總數及分類比例的固定快照，不含原始網址與標題。任何持有連結的人可閱讀；到「帳號與朋友 → 分享」撤銷。</li><li><strong>朋友配對：</strong>雙方接受朋友邀請並開啟比較後，才會顯示興趣分類相似度；相似不代表性格相同。原始歷史仍只供本人存取。</li></ul><p><a href="/community.html#friends">管理朋友與配對</a> · <a href="/community.html#shares">管理摘要分享</a></p></section>
<section id="trouble" class="community-section"><h2>遇到問題時</h2><ul><li>連線失敗：檢查網路後重試。編輯輸入會保留；若送出後斷線，先確認是否已完成，避免重複建立分享或邀請。</li><li>洞察或推估無法載入：按區塊內的「重試」。顯示上次結果時會明確標記。</li><li>登入無效：確認使用原帳號；Google 尚未連結時，先用密碼或原始金鑰登入並完成連結。</li><li>沒有資料：切換「全部」、清除搜尋、確認登入的是自己的帳號，並檢查設定頁的來源與同步狀態。</li><li>匯入被拒收：檢查下載的錯誤報告，修正項目後重新匯入。使用 MyZilla 匯出的 JSON 收藏備份，不是瀏覽器 SQLite 歷史檔。</li><li>無法複製：複製視窗會保留內容供手動選取。只出現一次的金鑰與邀請碼請保存後再離開。</li></ul></section><footer>MyZilla</footer></main>`;
installUX(root);
const search = document.getElementById("help-search") as HTMLInputElement;
const sections = [...root.querySelectorAll<HTMLElement>("section[id]")];
function filter() {
  const q = search.value.trim().toLocaleLowerCase();
  sections.forEach(
    (s) => (s.hidden = !!q && !s.textContent!.toLocaleLowerCase().includes(q)),
  );
  document.getElementById("help-status")!.textContent = q
    ? `找到 ${sections.filter((s) => !s.hidden).length} 個說明主題。清除搜尋可查看全部。`
    : "";
}
search.addEventListener("input", filter);
root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
  a.addEventListener("click", (event) => {
    event.preventDefault();
    history.pushState(null, "", a.hash);
    search.value = "";
    filter();
    const section = document.getElementById(a.hash.slice(1));
    if (section) {
      section.scrollIntoView();
      focusHeading(section);
    }
  }),
);

if (["chrome-extension:", "moz-extension:"].includes(location.protocol)) {
  root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((a) => {
    a.href = "https://myzilla.observe.tw" + a.getAttribute("href");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}
