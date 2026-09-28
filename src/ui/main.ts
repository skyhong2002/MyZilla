import "./style.css";
import "./classic.css";
import { personalInsights } from "./personal-insights";
import type { Settings } from "../shared/events";
import { webUrl, type SiteSummary, type Visit } from "../shared/model";
import {
  readNavigation,
  navigationUrl,
  viewLabels,
  type View,
} from "./navigation";

const extension = ["chrome-extension:", "moz-extension:"].includes(
  location.protocol,
);
const browser = extension
  ? (await import("webextension-polyfill")).default
  : undefined;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds} 秒`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)} 分`
      : `${Math.floor(seconds / 3600)} 小時 ${Math.floor((seconds % 3600) / 60)} 分`;
};
type HistoryVisit = Visit & {
  source: { browser: string; profile: string; device: string };
};
type Report = { sites: SiteSummary[]; visitCount: number };
let state = readNavigation(new URL(location.href), extension);
let config: Settings | undefined;
let report: Report | undefined;
let visits: HistoryVisit[] = [];
let recent: HistoryVisit[] = [];
let totalMatches = 0;
let token = extension ? "" : (sessionStorage.getItem("myzilla-token") ?? "");
let authenticated = false;
let busy = false;
let generation = 0;
let searchGeneration = 0;
let siteLimit = 25;
const colors = [
  "#8bc4a8",
  "#83a8d3",
  "#d8b877",
  "#bc98d1",
  "#db9d87",
  "#7a817d",
];

$("app").innerHTML = `
<a class="skip-link" href="#page-title">跳到主要內容</a>
<header class="site-header"><a class="brand" href="#overview" data-view="overview"><img class="brand-logo" src="./myzilla-mark.svg" width="48" height="36" alt=""><span><strong>MyZilla</strong><small>BROWSING, REVISITED</small></span></a><nav class="site-nav" aria-label="主要導覽">${extension ? "" : '<a href="/">我的入口</a>'}<a href="#overview" data-view="overview" data-main-nav="dashboard">儀表板</a><a href="#settings" data-view="settings" data-main-nav="settings">匯入與設定</a>${extension ? "" : '<a href="/community.html">帳號與朋友</a><button id="logout" type="button" hidden>鎖定</button>'}</nav></header>
<main class="site-main">
<section class="profile"><div class="avatar" aria-hidden="true">M</div><div class="profile-copy"><div class="eyebrow">PERSONAL BROWSING ARCHIVE</div><div class="title-row"><h1 id="page-title" tabindex="-1">我的瀏覽空間</h1><span class="private-badge">私人</span></div><p id="page-scope">總覽 · 全部紀錄</p></div><a href="#settings" data-view="settings" class="button profile-action">匯入紀錄 <span aria-hidden="true">↗</span></a></section>
<nav class="page-nav" aria-label="瀏覽紀錄導覽">${(["overview", "insights", "history", "recap"] as View[]).map((view) => `<a href="#${view}" data-view="${view}">${viewLabels[view]}</a>`).join("")}</nav>
<div id="range-controls" class="range-controls"><div class="period" role="group" aria-label="回顧範圍"><button data-days="1">今天</button><button data-days="7">近 7 天</button><button data-days="30">近 30 天</button><button data-days="0">全部</button></div><span id="range-label"></span></div>
<div id="message" role="status" aria-live="polite">${extension ? "預設暫停記錄。設定連線後，即可開始同步。" : "解鎖後，查看自己的瀏覽紀錄。"}</div>
<section id="settings" class="connection" aria-labelledby="connection-title"><div class="section-heading"><div><div class="eyebrow">${extension ? "CONNECTION" : "PRIVATE ACCESS"}</div><h2 id="connection-title">${extension ? "連接你的瀏覽空間" : "開啟你的私人回顧"}</h2><p>${extension ? "完整網址、標題、造訪時間與估計前景時間會同步至你指定的伺服器。" : "輸入存取金鑰以讀取紀錄。金鑰只保留在此分頁工作階段。"}</p></div><span id="connection-state" class="status-chip">尚未連線</span></div>
<form id="connect-form">${extension ? '<label class="server-field">伺服器網址<input id="server" type="url" value="https://myzilla.observe.tw" required /></label><label>瀏覽器<input id="browser-name" required placeholder="Brave / Zen / Chrome / Arc / Dia"/></label><label>設定檔<input id="profile-name" required placeholder="Default / 工作 / 個人"/></label><label>裝置<input id="device-name" required placeholder="Sky Mac"/></label>' : ""}<label class="token-field">存取金鑰<input id="token" type="password" required minlength="32" autocomplete="off" placeholder="貼上你的存取金鑰"/></label><button class="primary" type="submit">${extension ? "儲存並連線" : "解鎖回顧"} <span aria-hidden="true">↗</span></button></form>
${!extension ? '<p class="access-help"><a href="/community.html">使用帳號登入／建立擁有者帳號 →</a></p><p class="access-help">已完成歷史匯入？直接解鎖即可查看。要累積新的紀錄，請在下方安裝擴充功能。</p>' : ""}
<div id="capture-controls" ${extension ? "" : "hidden"}><div class="section-heading"><div><h3>紀錄與同步</h3><p>開始後累積新的活動；離線紀錄會保留，連線後補送。</p></div></div><div class="actions"><button id="toggle" class="primary" type="button">開始記錄</button><button id="sync" type="button">立即同步</button><button id="import" type="button">匯入全部歷史</button></div><p id="capture-status"></p><p class="note">已透過原生工具匯入此設定檔的歷史，直接開始記錄即可，避免重複匯入。</p></div>
</section>
<section id="setup-guide" class="setup-guide"><div class="section-heading"><div><h2>讓瀏覽紀錄持續累積</h2><p>每個瀏覽器設定檔分別設定一次，就能在這裡一起回顧。</p></div></div><div class="setup-steps"><article><span class="step-number">01</span><h3>安裝擴充功能</h3><p>在使用中的瀏覽器與設定檔安裝對應版本。</p><a href="${extension ? "https://myzilla.observe.tw" : ""}/downloads/myzilla-chromium.zip">Brave / Chrome / Arc / Dia ↗</a><a href="${extension ? "https://myzilla.observe.tw" : ""}/downloads/myzilla-firefox.zip">Zen / Firefox ↗</a><small>Zen／Firefox 測試版重啟後需重新載入。</small></article><article><span class="step-number">02</span><h3>連線並開始記錄</h3><p>從工具列開啟 MyZilla，填入金鑰與來源名稱，按「開始記錄」。</p><a href="${extension ? "https://myzilla.observe.tw" : ""}/downloads/install.md">查看安裝步驟 ↗</a></article><article><span class="step-number">03</span><h3>找回以前看過的內容</h3><p>首次可匯入全部既有歷史，再到總覽與歷史頁探索。</p><a href="${extension ? "https://myzilla.observe.tw" : ""}/downloads/import-contract.md">多瀏覽器歷史匯入說明 ↗</a></article></div><div id="sources-section" hidden><h3>已同步的來源</h3><p class="note">所有期間的累計紀錄，依瀏覽器、設定檔與裝置呈現。</p><div id="sources-list"></div></div></section>
<div id="dashboard" hidden>
<section id="overview-view" data-panel="overview"><div id="personal-overview"></div><div class="stats"><article><strong id="visits-stat">—</strong><span>造訪次數</span></article><article><strong id="sites-stat">—</strong><span>網站與來源</span></article><article><strong id="time-stat">—</strong><span>估計前景時間</span></article></div><p class="note">前景時間從啟用記錄後累積；匯入的舊歷史只有造訪次數。</p><div class="section-heading"><div><h2>經常造訪的網站</h2><p>從日常的足跡，看看你持續關注什麼。</p></div><div class="sort-control"><label for="metric">排序依據</label><select id="metric"><option value="visits">造訪次數</option><option value="milliseconds">前景時間</option></select></div></div><div id="ranking" class="ranking"></div><a class="text-link" href="#insights" data-view="insights">查看完整網站分布 →</a><section class="recent-section"><div class="section-heading"><h2>最近看過的頁面</h2><a class="text-link" href="#history" data-view="history">全部歷史 →</a></div><div id="recent-list"></div></section></section>
<section id="insights-view" data-panel="insights" hidden><div id="personal-insights"></div><details><summary>網站使用統計</summary><div class="section-heading"><div><h2>你的注意力分布</h2><p>以造訪次數和估計前景時間，從兩個角度回顧瀏覽習慣。</p></div><select id="insights-metric" aria-label="洞察統計方式"><option value="visits">造訪次數</option><option value="milliseconds">前景時間</option></select></div><div class="insights-grid"><div id="distribution"></div><div id="insight-summary" class="insight-summary"></div></div><p class="method-note">前景時間估計瀏覽器有焦點、分頁啟用且電腦未閒置時的活動，並非實際閱讀時間。</p><div class="section-heading"><h2>所有網站</h2><span id="sites-count"></span></div><div class="table-scroll"><table class="sites-table"><thead><tr><th scope="col">網站</th><th scope="col">造訪次數</th><th scope="col">前景時間</th></tr></thead><tbody id="sites-list"></tbody></table></div><button id="more-sites" type="button" hidden>顯示更多網站</button></details></section>
<section id="history-view" data-panel="history" hidden><div class="section-heading"><div><h2>瀏覽歷史</h2><p id="history-count">搜尋所有已同步的紀錄。</p></div><label class="search"><span class="sr-only">搜尋造訪紀錄</span><input id="search" type="search" maxlength="2000" placeholder="搜尋標題或網址" aria-label="搜尋造訪紀錄"/></label></div><div id="history-list"></div><div class="pagination"><button id="previous" type="button">← 上一頁</button><span id="page-info"></span><button id="next" type="button">下一頁 →</button></div></section>
<section id="recap-view" data-panel="recap" hidden><div class="eyebrow">YOUR BROWSING RECAP</div><h2 class="recap-title">這段時間，你看了些什麼？</h2><p class="note">依目前選取期間的全部紀錄整理。</p><div id="recap-content"></div><a href="#history" data-view="history" class="button">回到歷史，找回那些頁面 →</a></section>
</div><footer><span>MyZilla</span><span>把你看過的，變成值得留下的。</span><span>私人瀏覽空間</span></footer>
</main>`;

function message(text: string, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function applyNavigation(focus = false) {
  const settings = state.view === "settings";
  $("settings").hidden = authenticated && !settings;
  $("setup-guide").hidden = authenticated && !settings;
  $("dashboard").hidden = !authenticated || settings;
  $("range-controls").hidden = settings || !authenticated;
  document
    .querySelectorAll<HTMLElement>("[data-panel]")
    .forEach((el) => (el.hidden = el.dataset.panel !== state.view));
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((el) => {
    const view = el.dataset.view as View;
    el.setAttribute(
      "href",
      navigationUrl(new URL(location.href), { ...state, view }),
    );
    const current =
      el.dataset.mainNav === "dashboard" ? !settings : view === state.view;
    if (current) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-days]")
    .forEach((button) => {
      const selected = Number(button.dataset.days) === state.days;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  ($("metric") as HTMLSelectElement).value = state.metric;
  ($("insights-metric") as HTMLSelectElement).value = state.metric;
  ($("search") as HTMLInputElement).value = state.query;
  const range =
    state.days === 0
      ? "全部紀錄"
      : state.days === 1
        ? "今天"
        : `近 ${state.days} 天`;
  $("page-scope").textContent = settings
    ? "管理連線、匯入與同步來源"
    : `${viewLabels[state.view]} · ${range}`;
  document.title = `${viewLabels[state.view]} · MyZilla`;
  $("connection-state").textContent = authenticated ? "已連線" : "尚未連線";
  if ($("logout")) $("logout").hidden = !authenticated;
  if (focus) {
    $("page-title").focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: "instant" });
  }
  bounds();
}
function writeNavigation(replace = false) {
  history[replace ? "replaceState" : "pushState"](
    null,
    "",
    navigationUrl(new URL(location.href), state),
  );
  applyNavigation();
}
function navigate(view: View) {
  state.view = view;
  writeNavigation();
  applyNavigation(true);
}
function bounds() {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - state.days + 1);
  if (!state.days) from.setTime(-8_640_000_000_000_000);
  $("range-label").textContent = !state.days
    ? "全部既有紀錄 · 依本機時區"
    : `${from.toLocaleDateString("zh-TW")} — ${now.toLocaleDateString("zh-TW")}`;
  return { from: from.getTime(), to: now.getTime() };
}
async function command(type: string, extra = {}) {
  const response = (await browser!.runtime.sendMessage({ type, ...extra })) as {
    ok: boolean;
    error?: string;
    data: any;
  };
  if (!response?.ok)
    throw new Error(response?.error ?? "擴充功能沒有回應，請重新載入");
  return response.data;
}
async function status() {
  if (!extension) return;
  const data = await command("status");
  config = data.config;
  token = config!.token;
  for (const [id, value] of [
    ["server", config!.server],
    ["browser-name", config!.browser],
    ["profile-name", config!.profile],
    ["device-name", config!.device],
    ["token", token],
  ])
    $<HTMLInputElement>(id).value = value;
  $("toggle").textContent = config!.enabled ? "暫停記錄" : "開始記錄";
  $("capture-status").textContent =
    `${config!.enabled ? "● 記錄中" : "○ 已暫停"} · 本機 ${data.total.toLocaleString()} 筆 · 待同步 ${data.pending.toLocaleString()} 筆${data.importStatus ? ` · ${data.importStatus}` : ""}`;
  if (data.syncStatus?.error) message(data.syncStatus.error, true);
  else if (data.syncStatus?.at)
    message(
      `最近同步：${new Date(data.syncStatus.at).toLocaleString("zh-TW")}`,
    );
}
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${extension ? config!.server : ""}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (!response.ok) {
    if (response.status === 401) {
      authenticated = false;
      applyNavigation();
      throw new Error("金鑰不正確或已失效，請重新輸入。");
    }
    throw new Error(`讀取失敗（HTTP ${response.status}）`);
  }
  return response.json();
}
const personal = personalInsights(api);
async function refresh() {
  if (!token) return;
  const version = ++generation;
  const { from, to } = bounds();
  message("正在讀取瀏覽紀錄…");
  const data: Report = await api(`/api/report?from=${from}&to=${to}`);
  if (version !== generation) return;
  report = data;
  authenticated = true;
  render();
  applyNavigation();
  await Promise.all([
    loadHistory(),
    loadRecent(from, to),
    loadSources(),
    personal.load(from, to),
  ]);
  if (version === generation) message("已連線 · 所有資料來自你的私人伺服器");
}
function render() {
  if (!report) return;
  const totalTime = report.sites.reduce((sum, s) => sum + s.milliseconds, 0);
  $("visits-stat").textContent = report.visitCount.toLocaleString();
  $("sites-stat").textContent = report.sites.length.toLocaleString();
  $("time-stat").textContent = totalTime ? duration(totalTime) : "尚未記錄";
  const sites = [...report.sites].sort(
    (a, b) => b[state.metric] - a[state.metric],
  );
  const active = sites.filter((s) => s[state.metric] > 0);
  const total = active.reduce((sum, s) => sum + s[state.metric], 0);
  const value = (n: number) =>
    state.metric === "visits" ? `${n.toLocaleString()} 次` : duration(n);
  if (!total) {
    const empty = `<div class="empty"><h3>${state.metric === "visits" ? "還沒有造訪紀錄" : "時間正在慢慢累積"}</h3><p>${state.metric === "visits" ? "切換日期，或從匯入與設定開始加入紀錄。" : "啟用記錄後才會累積前景時間；舊歷史不會換算為閱讀時長。"}</p><a href="#settings" data-view="settings">前往匯入與設定 →</a></div>`;
    $("ranking").innerHTML = empty;
    $("distribution").innerHTML = empty;
    $("insight-summary").textContent = "目前期間尚無足夠資料。";
  } else {
    $("ranking").innerHTML = active
      .slice(0, 8)
      .map(
        (s, i) =>
          `<div class="rank"><span class="rank-number">${String(i + 1).padStart(2, "0")}</span><span class="site-icon" aria-hidden="true">${escape(s.domain.slice(0, 1).toUpperCase())}</span><div class="rank-main"><div class="rank-label"><strong>${escape(s.domain)}</strong><span>${value(s[state.metric])}</span></div><div class="bar"><i style="width:${(s[state.metric] / active[0][state.metric]) * 100}%"></i></div></div></div>`,
      )
      .join("");
    const parts = active
      .slice(0, 5)
      .map((s) => ({ name: s.domain, value: s[state.metric] }));
    const rest = total - parts.reduce((sum, s) => sum + s.value, 0);
    if (rest) parts.push({ name: "其他網站", value: rest });
    let angle = 0;
    const gradient = parts
      .map((s, i) => {
        const start = angle;
        angle += (s.value / total) * 100;
        return `${colors[i]} ${start}% ${angle}%`;
      })
      .join(",");
    $("distribution").innerHTML =
      `<div class="donut" role="img" aria-label="${state.metric === "visits" ? "造訪次數" : "前景時間"}分布" style="background:conic-gradient(${gradient})"><div><span>${state.metric === "visits" ? "總造訪" : "前景時間"}</span><strong>${value(total)}</strong></div></div><ul class="legend">${parts.map((s, i) => `<li><i style="background:${colors[i]}"></i><span>${escape(s.name)}</span><b>${s.value / total < 0.01 ? "不到 1" : Math.round((s.value / total) * 100)}%</b></li>`).join("")}</ul>`;
    $("insight-summary").innerHTML =
      `<div class="eyebrow">${state.metric === "visits" ? "MOST VISITED" : "MOST FOREGROUND TIME"}</div><h3>${escape(active[0].domain)}</h3><p>占這段期間${state.metric === "visits" ? "造訪次數" : "估計前景時間"}的 <strong>${Math.round((active[0][state.metric] / total) * 100)}%</strong>。</p><p>共 ${report.sites.length.toLocaleString()} 個網站與來源，${report.visitCount.toLocaleString()} 次造訪。</p>`;
  }
  $("sites-count").textContent =
    `${report.sites.length.toLocaleString()} 個網站與來源`;
  $("sites-list").innerHTML = sites
    .slice(0, siteLimit)
    .map(
      (s) =>
        `<tr><th scope="row">${escape(s.domain)}</th><td>${s.visits.toLocaleString()}</td><td>${duration(s.milliseconds)}</td></tr>`,
    )
    .join("");
  $("more-sites").hidden = sites.length <= siteLimit;
  const top = [...report.sites].sort((a, b) => b.visits - a.visits)[0];
  $("recap-content").innerHTML = report.visitCount
    ? `<article class="recap-chapter"><span>01 / 你的足跡</span><strong>${report.visitCount.toLocaleString()}<small> 次造訪</small></strong><p>你留下了 ${report.sites.length.toLocaleString()} 個網站與來源的紀錄。</p></article><article class="recap-chapter"><span>02 / 最常回來的地方</span><strong class="recap-domain">${escape(top?.domain ?? "—")}</strong><p>${(top?.visits ?? 0).toLocaleString()} 次造訪，占全部造訪的 ${Math.round(((top?.visits ?? 0) / report.visitCount) * 100)}%。</p></article><article class="recap-chapter"><span>03 / 留下的時間</span><strong>${duration(totalTime)}</strong><p>${totalTime ? "這是啟用記錄後累積的估計前景時間，並非實際閱讀時長。" : "尚未累積前景時間。啟用擴充功能後，新活動才會開始計時。"}</p></article>`
    : '<div class="empty"><h3>等待你的第一段瀏覽足跡</h3><p>切換期間或先匯入紀錄，再回來看看。</p></div>';
}
function visitMarkup(v: HistoryVisit, className: string) {
  const safe = webUrl(v.url);
  let host = "內部頁面";
  try {
    host = new URL(v.url).hostname || host;
  } catch {}
  return `<${safe ? "a" : "div"} class="${className}" ${safe ? `href="${escape(safe)}" target="_blank" rel="noopener noreferrer"` : ""}><span class="site-icon" aria-hidden="true">${escape(host.slice(0, 1).toUpperCase())}</span><div><strong>${escape(v.title || v.url || "（來源無網址）")}</strong><span>${escape(v.url)}</span><small>${escape(v.source.browser)} · ${escape(v.source.profile)} · ${escape(v.source.device)}</small></div><time>${new Date(v.visitedAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time><span aria-hidden="true">${safe ? "↗" : "·"}</span></${safe ? "a" : "div"}>${!extension && safe ? `<a class="save-history-link" href="/?captureUrl=${encodeURIComponent(safe)}&captureTitle=${encodeURIComponent(v.title.slice(0, 500))}#bookmark">加入我的網址</a>` : ""}`;
}
async function loadRecent(from: number, to: number) {
  const version = generation;
  const data = await api(
    `/api/visits?${new URLSearchParams({ from: String(from), to: String(to), limit: "6", offset: "0" })}`,
  );
  if (version !== generation) return;
  recent = data.visits;
  $("recent-list").innerHTML = recent.length
    ? recent.map((v) => visitMarkup(v, "recent-visit")).join("")
    : '<p class="empty">這段期間還沒有紀錄。</p>';
}
async function loadSources() {
  const data = await api("/api/sources");
  $("sources-section").hidden = false;
  $("sources-list").innerHTML = data.sources.length
    ? data.sources
        .map(
          (s: {
            source: HistoryVisit["source"];
            kind: string;
            count: number;
          }) =>
            `<div class="source-row"><div><strong>${escape(s.source.browser)} · ${escape(s.source.profile)}</strong><span>${escape(s.source.device)}</span></div><span>${s.count.toLocaleString()} 筆${s.kind === "visit" ? "造訪" : "時間區間"}</span></div>`,
        )
        .join("")
    : '<p class="empty">尚無同步來源，完成一次匯入後會顯示在這裡。</p>';
}
async function loadHistory() {
  if (!token) return;
  const version = ++searchGeneration;
  const { from, to } = bounds();
  const data = await api(
    `/api/visits?${new URLSearchParams({ from: String(from), to: String(to), q: state.query, offset: String(state.offset), limit: "200" })}`,
  );
  if (version !== searchGeneration) return;
  visits = data.visits;
  totalMatches = data.total;
  renderHistory();
}
function renderHistory() {
  $("history-count").textContent =
    `共 ${totalMatches.toLocaleString()} 筆${state.query ? "符合的" : ""}造訪 · 搜尋涵蓋所選期間全部紀錄`;
  $("history-list").innerHTML = visits.length
    ? visits.map((v) => visitMarkup(v, "visit")).join("")
    : `<div class="empty"><h3>${state.query ? "找不到符合的紀錄" : "這段期間還沒有紀錄"}</h3><p>試試其他關鍵字、切換日期，或從擴充功能同步。</p>${state.query ? '<button id="clear-search" type="button">清除搜尋</button>' : ""}</div>`;
  $("page-info").textContent =
    totalMatches && visits.length
      ? `${state.offset + 1}–${Math.min(state.offset + visits.length, totalMatches)} / ${totalMatches.toLocaleString()}`
      : "0 筆";
  ($("previous") as HTMLButtonElement).disabled = busy || state.offset === 0;
  ($("next") as HTMLButtonElement).disabled =
    busy || state.offset + visits.length >= totalMatches;
}
async function run(job: () => Promise<void>) {
  if (busy) return;
  busy = true;
  $("app").setAttribute("aria-busy", "true");
  document
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) => (b.disabled = true));
  try {
    await job();
  } catch (error) {
    message(error instanceof Error ? error.message : "操作失敗", true);
  } finally {
    busy = false;
    $("app").removeAttribute("aria-busy");
    document
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.disabled = false));
    if (report) renderHistory();
  }
}
$("app").addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const link = target.closest<HTMLAnchorElement>("a[data-view]");
  if (
    link &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    navigate(link.dataset.view as View);
  }
  if (target.closest("#clear-search")) {
    state.query = "";
    state.offset = 0;
    writeNavigation();
    void run(loadHistory);
  }
});
$("connect-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const server = extension
    ? ($("server") as HTMLInputElement).value.trim()
    : "";
  const entered = ($("token") as HTMLInputElement).value.trim();
  let permission = Promise.resolve(true);
  if (extension) {
    try {
      const url = new URL(server);
      permission = browser!.permissions.request({
        origins: [`${url.protocol}//${url.hostname}/*`],
      });
    } catch {
      message("伺服器網址格式不正確", true);
      return;
    }
  }
  void run(async () => {
    if (!(await permission)) throw new Error("未授權連線，設定尚未儲存");
    if (extension) {
      await command("save", {
        server,
        token: entered,
        browser: ($("browser-name") as HTMLInputElement).value,
        profile: ($("profile-name") as HTMLInputElement).value,
        device: ($("device-name") as HTMLInputElement).value,
      });
      await status();
    } else {
      token = entered;
      sessionStorage.setItem("myzilla-token", token);
    }
    await refresh();
  });
});
$("logout")?.addEventListener("click", async () => {
  await fetch("/api/community/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  sessionStorage.removeItem("myzilla-token");
  location.reload();
});
for (const type of ["toggle", "sync", "import"])
  $(type)?.addEventListener("click", () => {
    void run(async () => {
      message(type === "import" ? "正在匯入全部歷史，請稍候…" : "正在處理…");
      await command(type);
      await status();
      if (token) await refresh();
    });
  });
document.querySelectorAll<HTMLButtonElement>("[data-days]").forEach((button) =>
  button.addEventListener("click", () => {
    state.days = Number(button.dataset.days);
    state.offset = 0;
    writeNavigation();
    void run(refresh);
  }),
);
for (const id of ["metric", "insights-metric"])
  $(id).addEventListener("change", () => {
    state.metric = $<HTMLSelectElement>(id).value as typeof state.metric;
    writeNavigation();
    render();
  });
$("more-sites").addEventListener("click", () => {
  siteLimit += 50;
  render();
});
let searchTimer: ReturnType<typeof setTimeout>;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchGeneration++;
  state.query = ($("search") as HTMLInputElement).value;
  state.offset = 0;
  writeNavigation(true);
  searchTimer = setTimeout(
    () => void loadHistory().catch((error) => message(error.message, true)),
    250,
  );
});
$("previous").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - 200);
  writeNavigation();
  void run(loadHistory);
});
$("next").addEventListener("click", () => {
  if (state.offset + 200 < totalMatches) {
    state.offset += 200;
    writeNavigation();
    void run(loadHistory);
  }
});
const restoreNavigation = () => {
  clearTimeout(searchTimer);
  const old = state;
  state = readNavigation(new URL(location.href), extension);
  applyNavigation();
  if (old.days !== state.days)
    void refresh().catch((error) => message(error.message, true));
  else {
    render();
    if (old.query !== state.query || old.offset !== state.offset)
      void loadHistory().catch((error) => message(error.message, true));
  }
};
addEventListener("popstate", restoreNavigation);
addEventListener("hashchange", restoreNavigation);
applyNavigation();
void run(async () => {
  if (extension) await status();
  if (token) await refresh();
});
if (extension)
  setInterval(() => {
    if (!busy && !document.querySelector("input:focus"))
      void status().catch((error) => message(error.message, true));
  }, 5000);
