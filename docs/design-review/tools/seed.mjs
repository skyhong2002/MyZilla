// Synthetic, fictional data for design-review screenshots. Never reads real data.
//   node docs/design-review/tools/seed.mjs http://127.0.0.1:PORT MASTER_TOKEN OUT_JSON
// Writes the owner, friend and empty-account tokens to OUT_JSON.
import { writeFile } from "node:fs/promises";
import { NOW } from "./states.mjs";

const [base, master, out] = process.argv.slice(2);
const password = "design-review-password-1";
async function call(path, token, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${method} ${path} ${r.status} ${JSON.stringify(data)}`);
  return data;
}
let seed = 20261113;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (list) => list[Math.floor(random() * list.length)];
const DAY = 86400000;

// Pages a fictional person keeps coming back to: [url, title, weight].
const pages = [
  ["https://github.com/honojs/hono/issues/3921", "Streaming response stalls behind Cloudflare Tunnel · Issue #3921 · honojs/hono", 5],
  ["https://github.com/honojs/hono", "honojs/hono: Web framework built on Web Standards", 4],
  ["https://developer.mozilla.org/zh-TW/docs/Web/CSS/color-mix", "color-mix() - CSS：層疊樣式表 | MDN", 3],
  ["https://developer.mozilla.org/zh-TW/docs/Web/API/Fetch_API/Using_Fetch", "使用 Fetch - Web API | MDN", 3],
  ["https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/", "Cloudflare Tunnel · Cloudflare Zero Trust docs", 4],
  ["https://developers.cloudflare.com/workers/runtime-apis/cache/", "Cache · Cloudflare Workers docs", 2],
  ["https://www.sqlite.org/wal.html", "Write-Ahead Logging - SQLite", 2],
  ["https://news.ycombinator.com/item?id=41982231", "Show HN: A self-hosted browsing history search | Hacker News", 2],
  ["https://www.twreporter.org/a/taiwan-rail-night-train", "最後的夜行列車：臺鐵夜車的三十年 - 報導者 The Reporter", 2],
  ["https://www.twreporter.org/a/coffee-farm-alishan", "阿里山咖啡的第二個十年：小農、氣候與精品市場 - 報導者", 3],
  ["https://zh.wikipedia.org/zh-tw/口琴", "口琴 - 維基百科，自由的百科全書", 3],
  ["https://www.youtube.com/watch?v=Hc4mQ8r2sTk", "Chromatic Harmonica Lesson 12: Breathing and Tone - YouTube", 4],
  ["https://www.youtube.com/watch?v=ZpR7uE0n3Lc", "半音階口琴練習曲〈月亮代表我的心〉慢速示範 - YouTube", 3],
  ["https://hackmd.io/@lin/harmonica-practice-log", "口琴練習紀錄 2026 秋 - HackMD", 4],
  ["https://hackmd.io/@lin/myzilla-notes", "MyZilla 部署筆記：Tunnel、systemd 與備份 - HackMD", 3],
  ["https://www.books.com.tw/products/0010987654", "博客來-咖啡沖煮的科學：從萃取到風味", 2],
  ["https://www.imdb.com/title/tt0118799/", "Life Is Beautiful (1997) - IMDb", 1],
  ["https://www.imdb.com/title/tt15398776/", "Oppenheimer (2023) - IMDb", 1],
  ["https://letterboxd.com/film/perfect-days-2023/", "Perfect Days (2023) directed by Wim Wenders • Letterboxd", 2],
  ["https://www.japan-guide.com/e/e2361.html", "Kanazawa Travel Guide - japan-guide.com", 3],
  ["https://www.japan-guide.com/e/e2167.html", "Takayama Travel Guide - japan-guide.com", 2],
  ["https://tabelog.com/tw/ishikawa/A1701/A170101/17000001/", "金澤 近江町市場 壽司 - Tabelog", 2],
  ["https://www.ptt.cc/bbs/Japan_Travel/M.1730000000.A.123.html", "[遊記] 金澤、白川鄉、高山 五天四夜 - 看板 Japan_Travel", 3],
  ["https://stackoverflow.com/questions/76543210/sqlite-wal-checkpoint-starvation", "SQLite WAL checkpoint starvation with long readers - Stack Overflow", 2],
  ["https://www.typescriptlang.org/docs/handbook/2/narrowing.html", "TypeScript: Documentation - Narrowing", 2],
  ["https://playwright.dev/docs/screenshots", "Screenshots | Playwright", 2],
  ["https://mail.google.com/mail/u/0/#inbox", "收件匣 - Gmail", 6],
  ["https://calendar.google.com/calendar/u/0/r/week", "Google 日曆 - 本週", 3],
  ["https://www.instagram.com/", "Instagram", 4],
  ["https://x.com/home", "首頁 / X", 3],
  ["https://www.facebook.com/", "Facebook", 2],
  ["https://www.cwa.gov.tw/V8/C/W/County/County.html?CID=63", "臺北市天氣 - 中央氣象署", 2],
];

async function postEvents(token, deviceId, source, events) {
  for (let i = 0; i < events.length; i += 250)
    await call("/api/events", token, "POST", {
      deviceId,
      source,
      events: events.slice(i, i + 250),
    });
}
function history(days, perDay, prefix) {
  const visits = [],
    attention = [];
  const weighted = pages.flatMap((p) => Array(p[2]).fill(p));
  for (let d = days; d >= 0; d--) {
    const dayStart = NOW - d * DAY - 14 * 3600000;
    const count = Math.round(perDay * (0.5 + random()));
    for (let i = 0; i < count; i++) {
      const [url, title] = pick(weighted);
      const at = Math.min(NOW - 600000, dayStart + Math.floor(random() * 15 * 3600000));
      const id = `${prefix}-${d}-${i}`;
      visits.push({ id, kind: "visit", url, title, visitedAt: at, transition: "link" });
      if (d < 21 && random() < 0.6)
        for (let k = 0, n = 1 + Math.floor(random() * 6); k < n; k++)
          attention.push({ id: `${id}-a${k}`, kind: "attention", url, startAt: at + k * 40000, endAt: at + k * 40000 + 30000 });
    }
  }
  return { visits, attention };
}

const MAC = { browser: "Arc", profile: "Default", device: "Lin MacBook Air", method: "native" };
const ZEN = { browser: "Zen", profile: "工作", device: "Lin MacBook Air", method: "extension" };
const owner = (await call("/api/community/claim", master, "POST", { handle: "lin", name: "林小晴", password })).token;
const a = history(120, 26, "arc");
await postEvents(owner, "8f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5", MAC, a.visits);
const z = history(20, 9, "zen");
await postEvents(owner, "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d", ZEN, [...z.visits, ...z.attention, ...a.attention.slice(0, 1200)]);

// Portal items.
const item = async (token, fields) => {
  const id = crypto.randomUUID();
  await call("/api/portal/items/" + id, token, "PUT", { visibility: "private", scope: "personal", tags: [], notes: "", ...fields });
  return id;
};
const bookmarks = [
  ["Gmail", "https://mail.google.com/", "work", ["每天"], 14],
  ["Google 日曆", "https://calendar.google.com/", "work", ["每天"], 11],
  ["HackMD 筆記", "https://hackmd.io/", "study", ["筆記"], 9],
  ["GitHub", "https://github.com/", "work", ["開發"], 8],
  ["中央氣象署 臺北", "https://www.cwa.gov.tw/V8/C/W/County/County.html?CID=63", "home", ["生活"], 6],
  ["報導者", "https://www.twreporter.org/", "personal", ["新聞"], 5],
  ["MDN Web Docs", "https://developer.mozilla.org/zh-TW/", "study", ["開發", "參考"], 4],
  ["Cloudflare 儀表板", "https://dash.cloudflare.com/", "work", ["部署"], 3],
  ["臺灣口琴協會", "https://www.harmonica.org.tw/", "personal", ["口琴"], 2],
  ["博客來", "https://www.books.com.tw/", "personal", ["書"], 1],
  ["japan-guide.com", "https://www.japan-guide.com/", "home", ["旅行"], 1],
  ["Playwright 文件", "https://playwright.dev/docs/intro", "study", ["測試"], 0],
];
const bookmarkIds = [];
for (const [title, url, scope, tags, clicks] of bookmarks) {
  const id = await item(owner, { kind: "bookmark", title, url, scope, tags, notes: clicks > 8 ? "每天開工第一個打開。" : "" });
  bookmarkIds.push(id);
  for (let i = 0; i < clicks; i++) await call(`/api/portal/items/${id}/open`, owner, "POST");
}
await item(owner, { kind: "article", title: "阿里山咖啡的第二個十年", url: "https://www.twreporter.org/a/coffee-farm-alishan", scope: "personal", tags: ["咖啡", "長文"], notes: "氣候變遷對小農的影響那段值得再讀一次。", visibility: "friends" });
await item(owner, { kind: "article", title: "SQLite WAL 模式說明", url: "https://www.sqlite.org/wal.html", scope: "study", tags: ["資料庫"], notes: "checkpoint 與長時間讀取的關係。" });
await item(owner, { kind: "article", title: "最後的夜行列車：臺鐵夜車的三十年", url: "https://www.twreporter.org/a/taiwan-rail-night-train", scope: "personal", tags: ["鐵道"], notes: "" });
const movie = await item(owner, { kind: "movie", title: "我心深處（Perfect Days）", url: "https://letterboxd.com/film/perfect-days-2023/", scope: "personal", tags: ["日本"], rating: 9, watched: 2, collection: "數位", notes: "平山先生每天早上的儀式。", visibility: "friends" });
await item(owner, { kind: "movie", title: "美麗人生", url: "https://www.imdb.com/title/tt0118799/", scope: "home", tags: ["經典"], rating: 10, watched: 3, collection: "DVD", notes: "" });
await item(owner, { kind: "movie", title: "奧本海默", url: "https://www.imdb.com/title/tt15398776/", scope: "personal", tags: [], rating: 7, watched: 1, notes: "IMAX 看的，三小時。" });
await item(owner, { kind: "movie", title: "海街日記", url: "", scope: "home", tags: ["是枝裕和"], rating: 0, watched: 0, wishlist: true, notes: "家人推薦。" });
await item(owner, { kind: "mood", title: "第一次完整吹完〈月亮代表我的心〉", mood: "happy", scope: "personal", notes: "高音還是會漏氣，但節奏穩了。" });
await item(owner, { kind: "mood", title: "部署卡在 Tunnel 一整個下午", mood: "tired", scope: "work", notes: "原來是 keep-alive 設定。" });
await item(owner, { kind: "mood", title: "週末去陽明山", mood: "calm", scope: "home", notes: "" });
for (const [engine, query] of [["google", "Cloudflare Tunnel keep-alive"], ["books", "咖啡沖煮"], ["imdb", "Perfect Days"], ["wikipedia", "半音階口琴"], ["google", "金澤 近江町市場 營業時間"]])
  await call("/api/portal/search", owner, "POST", { engine, query });
await call(`/api/portal/items/${bookmarkIds[2]}/link`, owner, "POST", { days: 7 });
await call(`/api/portal/items/${bookmarkIds[5]}/link`, owner, "POST", { days: 30 });

// Curation: inbox and collections.
await call("/api/curation/capture", owner, "POST", {
  items: [
    { url: "https://www.ptt.cc/bbs/Japan_Travel/M.1730000000.A.123.html", title: "[遊記] 金澤、白川鄉、高山 五天四夜", note: "" },
    { url: "https://stackoverflow.com/questions/76543210/sqlite-wal-checkpoint-starvation", title: "SQLite WAL checkpoint starvation with long readers", note: "備份腳本可能遇到" },
    { url: "https://playwright.dev/docs/screenshots", title: "Screenshots | Playwright", note: "" },
    { url: "https://www.youtube.com/watch?v=ZpR7uE0n3Lc", title: "半音階口琴練習曲〈月亮代表我的心〉慢速示範", note: "" },
    { url: "https://www.books.com.tw/products/0010987654", title: "咖啡沖煮的科學：從萃取到風味", note: "生日禮物候選" },
  ],
});
const collection = async (token, title, description, tags, visibility, links) => {
  const id = crypto.randomUUID();
  await call("/api/curation/collections/" + id, token, "PUT", { title, description, tags, visibility });
  await call(`/api/curation/collections/${id}/items`, token, "POST", { items: links.map(([url, title, note]) => ({ url, title, note })) });
  return id;
};
const trip = await collection(owner, "金澤與高山秋天行程", "十一月底的五天四夜，市場、老街與合掌村。", ["旅行", "日本"], "friends", [
  ["https://www.japan-guide.com/e/e2361.html", "Kanazawa Travel Guide", "先看兼六園與東茶屋街的開放時間。"],
  ["https://www.japan-guide.com/e/e2167.html", "Takayama Travel Guide", "朝市只到中午。"],
  ["https://tabelog.com/tw/ishikawa/A1701/A170101/17000001/", "金澤 近江町市場 壽司", "排隊名店，早上九點前到。"],
  ["https://www.ptt.cc/bbs/Japan_Travel/M.1730000000.A.123.html", "[遊記] 金澤、白川鄉、高山 五天四夜", "交通安排可以直接照抄。"],
]);
const selfHost = await collection(owner, "自架服務維運筆記", "Tunnel、SQLite 備份與監測，部署前回來看一遍。", ["部署", "SQLite"], "private", [
  ["https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/", "Cloudflare Tunnel 文件", "keep-alive 與 origin 設定。"],
  ["https://www.sqlite.org/wal.html", "Write-Ahead Logging - SQLite", "備份前先做 checkpoint。"],
  ["https://github.com/honojs/hono/issues/3921", "Streaming response stalls behind Cloudflare Tunnel", ""],
]);
await collection(owner, "半音階口琴入門", "從呼吸、單音到第一首曲子。", ["口琴"], "private", [
  ["https://www.youtube.com/watch?v=Hc4mQ8r2sTk", "Chromatic Harmonica Lesson 12: Breathing and Tone", "每天暖身用。"],
  ["https://zh.wikipedia.org/zh-tw/口琴", "口琴 - 維基百科", ""],
]);

// A friend with their own data, a friend-visible collection and presence on.
const invite = async () => (await call("/api/community/invitations", owner, "POST")).invitation;
const friend = (await call("/auth/register", "", "POST", { handle: "mei", name: "陳美玲", password, invitation: await invite() })).token;
await postEvents(friend, "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a", { browser: "Chrome", profile: "Default", device: "Mei iPad", method: "extension" }, history(40, 12, "mei").visits);
await call("/api/community/profile", owner, "PUT", { name: "林小晴", matching: true });
await call("/api/community/profile", friend, "PUT", { name: "陳美玲", matching: true });
await call("/api/community/friends", owner, "POST", { handle: "mei" });
const ownerId = (await call("/api/community/me", owner)).id;
await call(`/api/community/friends/${ownerId}/accept`, friend, "POST");
const friendId = (await call("/api/community/me", friend)).id;
await call(`/api/curation/collections/${selfHost}/members/${friendId}`, owner, "PUT");
await collection(friend, "台北好喝的咖啡店", "週末下午可以坐很久、插座多的店。", ["咖啡", "台北"], "friends", [
  ["https://www.twreporter.org/a/coffee-farm-alishan", "阿里山咖啡的第二個十年", "讀完會想喝淺焙。"],
]);
await item(friend, { kind: "movie", title: "我心深處（Perfect Days）", url: "https://letterboxd.com/film/perfect-days-2023/", rating: 8, watched: 1, visibility: "friends" });
await call("/api/portal/preferences", friend, "PUT", { online: true });
await call("/api/portal/me", friend);
const pending = (await call("/auth/register", "", "POST", { handle: "wei", name: "王大偉", password, invitation: await invite() })).token;
await call("/api/community/friends", pending, "POST", { handle: "lin" });
await call("/api/community/shares", owner, "POST", { days: 7 });

// An account with nothing in it, for empty states.
const empty = (await call("/auth/register", "", "POST", { handle: "new", name: "新朋友", password, invitation: await invite() })).token;
await writeFile(out, JSON.stringify({ owner, friend, empty, movie, trip }, null, 2));
console.log("seeded", a.visits.length + z.visits.length, "visits");
