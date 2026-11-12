// Screenshot inventory for the MyZilla design review. docs/design-review/states.md
// documents the same IDs; change both together and only between rounds that
// re-shoot the baseline.
//
// account: owner | empty | none      api: normal | loading | error
// steps:   actions run in order after load (click by text/selector, fill, file)
// fake:    write requests answered locally so no state changes the shared DB
export const NOW = Date.parse("2026-11-12T22:30:00+08:00");
export const SIZES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, maxHeight: 2400 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, maxHeight: 1688, isMobile: true, hasTouch: true },
};
const keyText = { text: "使用既有存取金鑰" };
export const STATES = [
  // Entry (index.html)
  { id: "entry-signed-out", path: "/", account: "none" },
  { id: "entry-signed-out-dark", path: "/", account: "none", theme: "dark" },
  { id: "entry-key-open", path: "/", account: "none", steps: [{ click: keyText }], viewportOnly: true },
  { id: "home", path: "/#home" },
  { id: "home-dark", path: "/#home", theme: "dark" },
  { id: "home-empty", path: "/#home", account: "empty" },
  { id: "home-loading", path: "/#home", api: "loading" },
  { id: "home-error", path: "/#home", api: "error" },
  { id: "bookmarks", path: "/#bookmark" },
  { id: "bookmarks-no-results", path: "/?scope=all&q=zzqxv&sort=recent&offset=0&audience=mine#bookmark" },
  { id: "bookmark-editor", path: "/#bookmark", steps: [{ click: { role: "button", name: "新增網址" } }], viewportOnly: true },
  { id: "bookmark-delete-undo", path: "/#bookmark", fake: true, steps: [{ click: { role: "button", name: "刪除" } }, { click: { selector: ".ux-confirm [data-confirm]" } }], viewportOnly: true },
  { id: "movies", path: "/#movie" },
  { id: "moods", path: "/#mood" },
  { id: "inbox", path: "/#inbox" },
  { id: "collections", path: "/#collections" },
  { id: "collection-detail", path: "/?collection={trip}#collections" },
  { id: "search-history", path: "/#search" },
  { id: "links", path: "/#links" },
  { id: "online", path: "/#online" },
  { id: "tools", path: "/#tools" },
  { id: "import-confirm", path: "/#tools", steps: [{ file: "import" }, { click: { role: "button", name: "匯入全部項目" } }], viewportOnly: true },
  { id: "import-progress", path: "/#tools", fake: "hang", steps: [{ file: "import" }, { click: { role: "button", name: "匯入全部項目" } }, { click: { selector: ".ux-confirm [data-confirm]" } }], viewportOnly: true },
  { id: "import-done", path: "/#tools", fake: true, steps: [{ file: "import" }, { click: { role: "button", name: "匯入全部項目" } }, { click: { selector: ".ux-confirm [data-confirm]" } }, { wait: 1500 }], viewportOnly: true },
  // Browsing review (dashboard.html)
  { id: "overview", path: "/dashboard.html#overview" },
  { id: "overview-dark", path: "/dashboard.html#overview", theme: "dark" },
  { id: "overview-empty", path: "/dashboard.html#overview", account: "empty" },
  { id: "overview-loading", path: "/dashboard.html#overview", api: "loading" },
  { id: "overview-error", path: "/dashboard.html#overview", api: "error" },
  { id: "insights", path: "/dashboard.html#insights" },
  { id: "history", path: "/dashboard.html#history" },
  { id: "history-search", path: "/dashboard.html?q=%E5%8F%A3%E7%90%B4#history" },
  { id: "history-no-results", path: "/dashboard.html?q=zzqxv#history" },
  { id: "recap", path: "/dashboard.html?range=30#recap" },
  { id: "settings", path: "/dashboard.html#settings" },
  { id: "dashboard-signed-out", path: "/dashboard.html", account: "none" },
  // Account and friends (community.html)
  { id: "community-signed-out", path: "/community.html", account: "none" },
  { id: "community-account", path: "/community.html#account" },
  { id: "community-interests", path: "/community.html#interests" },
  { id: "community-friends", path: "/community.html#friends" },
  { id: "community-friends-dark", path: "/community.html#friends", theme: "dark" },
  { id: "community-shares", path: "/community.html#shares" },
  // Help
  { id: "help", path: "/help.html", account: "none" },
  { id: "help-search", path: "/help.html", account: "none", steps: [{ fill: { selector: "#help-search", value: "分享" } }] },
];

// A fixed, fictional weekly digest; the real one comes from a scheduled AI job.
export const DIGEST = {
  digest: {
    from: NOW - 7 * 86400000,
    to: NOW,
    headline: "這週一半時間在處理自架服務的連線問題，晚上則回到口琴與金澤行程。",
    observations: [
      { title: "Tunnel 連線問題花了三個晚上", text: "反覆查 Cloudflare Tunnel 文件與 Hono 的 issue，最後在部署筆記記下 keep-alive 設定。", evidence: ["r1"] },
      { title: "口琴練習變規律", text: "五天都打開練習紀錄與同一支呼吸教學影片。", evidence: ["r2"] },
      { title: "旅行規劃進入細節", text: "從整體攻略轉到市場營業時間與交通。", evidence: [] },
    ],
    threads: [
      { title: "SQLite 備份與 checkpoint", why: "看過兩次 WAL 說明，還沒寫進備份腳本。", evidence: ["r3"] },
    ],
    question: "這次旅行要不要帶口琴？",
    refs: {
      r1: { kind: "page", url: "https://github.com/honojs/hono/issues/3921", title: "Streaming response stalls behind Cloudflare Tunnel", days: 3, earlierMonths: [] },
      r2: { kind: "page", url: "https://hackmd.io/@lin/harmonica-practice-log", title: "口琴練習紀錄 2026 秋 - HackMD", days: 5, earlierMonths: ["2026-10"] },
      r3: { kind: "page", url: "https://www.sqlite.org/wal.html", title: "Write-Ahead Logging - SQLite", days: 2, earlierMonths: [] },
    },
    stats: { visits: 412 },
    models: { classifier: "sky-fast", interpreter: "sky-quality" },
  },
};
export const IMPORT_FILE = {
  version: 1,
  items: [
    { id: "11111111-1111-4111-8111-111111111111", kind: "bookmark", title: "鐵道博物館", url: "https://www.railway.museum/", scope: "personal", tags: ["鐵道"], notes: "", visibility: "private" },
    { id: "22222222-2222-4222-8222-222222222222", kind: "article", title: "如何挑選第一把半音階口琴", url: "https://example.org/harmonica-guide", scope: "personal", tags: ["口琴"], notes: "", visibility: "friends" },
    { id: "33333333-3333-4333-8333-333333333333", kind: "movie", title: "神隱少女", url: "", scope: "home", tags: [], notes: "", visibility: "private", rating: 9, watched: 4 },
  ],
};

// Reference products, photographed once and reused in every round.
export const REFERENCES = [
  { id: "arena-explore", url: "https://www.are.na/explore" },
  { id: "arena-channel", url: "https://www.are.na/are-na-team/are-na-blog" },
  { id: "raindrop-home", url: "https://raindrop.io/" },
  // The demo publishes a shared test/test account on its login page.
  { id: "linkding-demo", url: "https://demo.linkding.link/login/", login: { user: "test", password: "test", then: "https://demo.linkding.link/bookmarks" } },
];
