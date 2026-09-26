import "./style.css";
import type { Settings } from "../shared/events";
import { webUrl, type SiteSummary, type Visit } from "../shared/model";
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
const duration = (ms: number) =>
  ms < 60000
    ? `${Math.round(ms / 1000)} 秒`
    : ms < 3600000
      ? `${Math.round(ms / 60000)} 分`
      : `${Math.floor(ms / 3600000)} 小時 ${Math.round((ms % 3600000) / 60000)} 分`;
let config: Settings | undefined;
let report: { sites: SiteSummary[]; visitCount: number } | undefined;
let visits: (Visit & {
  source: { browser: string; profile: string; device: string };
})[] = [];
let offset = 0;
let totalMatches = 0;
let searchGeneration = 0;
let token = extension ? "" : (sessionStorage.getItem("myzilla-token") ?? "");
let days = 0;
let metric: "visits" | "milliseconds" = "visits";
let busy = false;
let generation = 0;
const colors = [
  "#296d55",
  "#78a38d",
  "#c8a16b",
  "#73899e",
  "#9a809c",
  "#c08770",
];
$("app").innerHTML = `
  <aside><a class="brand" href="#">m<span>y</span>zilla<span class="brand-dot">.</span></a><div class="workspace">PERSONAL SPACE</div><nav><a href="#overview" class="active"><span>◷</span> 瀏覽回顧</a><a href="#history"><span>≡</span> 造訪紀錄</a><a href="#settings"><span>⚙</span> 連線設定</a></nav><div class="aside-note"><span class="small-dot"></span> 你的資料，你的伺服器<p>讓日常看過的資訊<br>留下可回顧的軌跡。</p><small>MYZILLA · EARLY PREVIEW</small></div></aside>
  <main id="overview"><header><div class="eyebrow">YOUR BROWSING, REVISITED</div><div class="heading"><div><h1>回頭看看，這些日常。</h1><p class="subtitle">從瀏覽的足跡，重新認識自己的注意力。</p></div><span class="badge">個人瀏覽回顧 / 01</span></div></header>
  ${extension ? "" : '<div class="install-links">開始累積新紀錄：<a href="/downloads/myzilla-chromium.zip">Brave / Chrome / Arc / Dia 擴充功能 ↗</a><a href="/downloads/myzilla-firefox.zip">Zen / Firefox 擴充功能 ↗</a><a href="/downloads/install.md">安裝說明 ↗</a><a href="/downloads/import-contract.md">全量歷史匯入 ↗</a></div>'}<section id="settings" class="connection panel"><div><h2>${extension ? "連接自己的伺服器" : "開啟你的私人回顧"}</h2><p>${extension ? "完整網址、標題、造訪時間與估計前景時間會同步至你指定的伺服器。" : "輸入存取金鑰後，才能讀取瀏覽紀錄。金鑰僅保留於此分頁工作階段。"}</p></div><form id="connect-form">${extension ? '<label>伺服器網址<input id="server" type="url" value="https://myzilla.observe.tw" required placeholder="https://myzilla.observe.tw"/></label>' : ""}${extension ? '<label>瀏覽器<input id="browser-name" required placeholder="Brave / Zen / Chrome / Arc / Dia"/></label><label>設定檔<input id="profile-name" required placeholder="Default / 工作 / 個人"/></label><label>裝置<input id="device-name" required placeholder="Sky Mac"/></label>' : ""}<label>存取金鑰<input id="token" type="password" required minlength="32" autocomplete="off" placeholder="貼上伺服器的存取金鑰"/></label><button class="primary" type="submit">${extension ? "儲存並連線" : "解鎖回顧"} <span>↗</span></button>${!extension ? '<button id="logout" type="button" class="subtle">鎖定</button>' : ""}</form><div id="capture-controls" ${extension ? "" : "hidden"}><button id="toggle" class="primary" type="button">開始記錄</button><button id="import" type="button">匯入全部歷史</button><button id="sync" type="button">立即同步</button><span id="capture-status"></span></div><div id="message" role="status" aria-live="polite">${extension ? "預設暫停記錄。開始後才會累積新的瀏覽資料。" : "尚未解鎖 · 瀏覽資料不會公開顯示"}</div></section>
  <div class="section-heading"><div><h2>你的瀏覽輪廓</h2><p id="range-label"></p></div><div class="period" role="group" aria-label="回顧範圍"><button data-days="1">今天</button><button data-days="7">近 7 天</button><button data-days="30">近 30 天</button><button data-days="0" class="selected">全部</button></div></div>
  <section class="stats"><article class="panel"><span>造訪次數</span><strong id="visits-stat">—</strong><small>每次造訪，都是一次探索</small></article><article class="panel"><span>造訪網站</span><strong id="sites-stat">—</strong><small>依網域彙整你的瀏覽足跡</small></article><article class="panel"><span>估計前景時間</span><strong id="time-stat">—</strong><small>僅計算啟用記錄後的前景活動</small></article></section>
  <section class="charts"><article class="panel distribution"><div class="card-heading"><h2>注意力分布</h2><select id="metric" aria-label="分布統計方式"><option value="visits">依造訪次數</option><option value="milliseconds">依前景時間</option></select></div><div id="distribution" class="chart-empty">連線後，看看你經常停留在哪裡。</div></article><article class="panel ranking"><div class="card-heading"><h2>網站排行</h2><span class="muted">TOP 8</span></div><div id="ranking" class="chart-empty">網站排行將顯示在這裡。</div></article></section>
  <p class="method-note">ⓘ 前景時間是瀏覽器視窗有焦點、分頁啟用且電腦未閒置時的估計值，並非實際閱讀時間。歷史匯入只包含造訪紀錄。</p>
  <section id="history" class="panel history"><div class="card-heading"><div><h2>那些看過的頁面</h2><p id="history-count">找到值得再看一眼的內容。</p></div><label class="search"><span>⌕</span><input id="search" type="search" placeholder="搜尋標題或網址" aria-label="搜尋造訪紀錄"/></label></div><div id="history-list" class="empty"><span>↗</span><h3>你的第一段瀏覽足跡</h3><p>安裝擴充功能、開始記錄並同步後，<br>就能在這裡回顧看過的頁面。</p></div><div class="pagination"><button id="previous" type="button">← 上一頁</button><span id="page-info"></span><button id="next" type="button">下一頁 →</button></div></section><footer>MyZilla <span>把你看過的，變成值得留下的。</span><span>私人回顧 · 自架儲存</span></footer></main>`;

function message(text: string, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
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
  const state = await command("status");
  config = state.config;
  token = config!.token;
  ($("browser-name") as HTMLInputElement).value = config!.browser;
  ($("profile-name") as HTMLInputElement).value = config!.profile;
  ($("device-name") as HTMLInputElement).value = config!.device;
  $("server") && (($("server") as HTMLInputElement).value = config!.server);
  ($("token") as HTMLInputElement).value = token;
  $("toggle").textContent = config!.enabled ? "暫停記錄" : "開始記錄";
  $("capture-status").textContent =
    `${config!.enabled ? "● 記錄中" : "○ 已暫停"} · 本機 ${state.total.toLocaleString()} 筆 · 待同步 ${state.pending.toLocaleString()} 筆${state.importStatus ? ` · ${state.importStatus}` : ""}`;
  if (state.syncStatus?.error) message(state.syncStatus.error, true);
  else if (state.syncStatus?.at)
    message(
      `最近同步：${new Date(state.syncStatus.at).toLocaleString("zh-TW")}${state.importStatus ? ` · ${state.importStatus}` : ""}`,
    );
}
function bounds() {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days + 1);
  if (days === 0) from.setTime(-8_640_000_000_000_000);
  $("range-label").textContent =
    days === 0
      ? "全部既有紀錄 · 不限日期 · 依本機時區"
      : `${from.toLocaleDateString("zh-TW")} — ${now.toLocaleDateString("zh-TW")} · 依本機時區`;
  return { from: from.getTime(), to: now.getTime() };
}
async function refresh() {
  const { from, to } = bounds();
  if (!token) return;
  const version = ++generation;
  message("正在讀取瀏覽紀錄…");
  const response = await fetch(
    `${extension ? config!.server : ""}/api/report?from=${from}&to=${to}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "金鑰不正確，請重新輸入。"
        : `讀取失敗（HTTP ${response.status}）`,
    );
  const data = await response.json();
  if (version !== generation) return;
  report = data;
  offset = 0;
  render();
  await loadHistory();
  message("已連線 · 資料來自你的私人伺服器");
}
function render() {
  if (!report) return;
  $("visits-stat").textContent = report.visitCount.toLocaleString();
  $("sites-stat").textContent = report.sites.length.toLocaleString();
  $("time-stat").textContent = duration(
    report.sites.reduce((sum, site) => sum + site.milliseconds, 0),
  );
  const sites = [...report.sites]
    .sort((a, b) => b[metric] - a[metric])
    .filter((s) => s[metric] > 0);
  const total = sites.reduce((sum, site) => sum + site[metric], 0);
  const label = (value: number) =>
    metric === "visits" ? `${value.toLocaleString()} 次` : duration(value);
  if (!total) {
    $("distribution").innerHTML =
      `<div class="empty"><h3>${metric === "visits" ? "還沒有造訪紀錄" : "時間還在慢慢累積"}</h3><p>${metric === "visits" ? "從擴充功能匯入全部歷史，或開始新的瀏覽。" : "啟用記錄後才會累積時間；歷史紀錄不會換算成時長。"}</p></div>`;
    $("ranking").innerHTML =
      '<div class="empty"><p>這個期間尚無可排行的資料。</p></div>';
  } else {
    const segments = sites
      .slice(0, 5)
      .map((s) => ({ name: s.domain, value: s[metric] }));
    const rest = total - segments.reduce((sum, s) => sum + s.value, 0);
    if (rest) segments.push({ name: "其他網站", value: rest });
    let offset = 0;
    const gradient = segments
      .map((s, i) => {
        const start = offset;
        offset += (s.value / total) * 100;
        return `${colors[i]} ${start}% ${offset}%`;
      })
      .join(",");
    $("distribution").innerHTML =
      `<div class="donut" role="img" aria-label="網站${metric === "visits" ? "造訪" : "前景時間"}分布" style="background:conic-gradient(${gradient})"><div><span>${metric === "visits" ? "總造訪" : "前景時間"}</span><strong>${label(total)}</strong></div></div><ul class="legend">${segments.map((s, i) => `<li><i style="background:${colors[i]}"></i><span>${escape(s.name)}</span><b>${Math.round((s.value / total) * 100)}%</b></li>`).join("")}</ul>`;
    $("ranking").innerHTML = sites
      .slice(0, 8)
      .map(
        (s, i) =>
          `<div class="rank"><span class="rank-number">${String(i + 1).padStart(2, "0")}</span><div><div class="rank-label"><span>${escape(s.domain)}</span><b>${label(s[metric])}</b></div><div class="bar"><i style="width:${(s[metric] / sites[0][metric]) * 100}%"></i></div></div></div>`,
      )
      .join("");
  }
}
async function loadHistory() {
  if (!token) return;
  const version = ++searchGeneration;
  const { from, to } = bounds();
  const query = ($("search") as HTMLInputElement).value;
  const params = new URLSearchParams({
    from: String(from),
    to: String(to),
    q: query,
    offset: String(offset),
    limit: "200",
  });
  const response = await fetch(
    `${extension ? config!.server : ""}/api/visits?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new Error(`搜尋失敗（HTTP ${response.status}）`);
  const data = await response.json();
  if (version !== searchGeneration) return;
  visits = data.visits;
  totalMatches = data.total;
  renderHistory();
}
function renderHistory() {
  $("history-count").textContent =
    `共 ${totalMatches.toLocaleString()} 筆符合的造訪 · 搜尋涵蓋所選期間全部紀錄`;
  $("history-list").className = visits.length ? "visit-list" : "empty";
  $("history-list").innerHTML = visits.length
    ? visits
        .map((v) => {
          const safe = webUrl(v.url);
          let host = "內部頁面";
          try {
            host = new URL(v.url).hostname || host;
          } catch {
            /* Keep original source text. */
          }
          return `<${safe ? "a" : "div"} class="visit" ${safe ? `href="${escape(safe)}" target="_blank" rel="noopener noreferrer"` : ""}><span class="site-icon">${escape(host.slice(0, 1).toUpperCase())}</span><div><strong>${escape(v.title || v.url || "（來源無網址）")}</strong><span>${escape(v.url)}</span><span>${escape(v.source.browser)} · ${escape(v.source.profile)} · ${escape(v.source.device)}</span></div><time>${new Date(v.visitedAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time><span>${safe ? "↗" : "·"}</span></${safe ? "a" : "div"}>`;
        })
        .join("")
    : "<h3>還沒有符合的紀錄</h3><p>試試其他關鍵字、切換日期，或從擴充功能同步。</p>";
  $("page-info").textContent = totalMatches
    ? `${offset + 1}–${Math.min(offset + visits.length, totalMatches)} / ${totalMatches.toLocaleString()}`
    : "0 筆";
  ($("previous") as HTMLButtonElement).disabled = offset === 0;
  ($("next") as HTMLButtonElement).disabled =
    offset + visits.length >= totalMatches;
}

async function run(job: () => Promise<void>) {
  if (busy) return;
  busy = true;
  document
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) => (button.disabled = true));
  try {
    await job();
  } catch (error) {
    message(error instanceof Error ? error.message : "操作失敗", true);
  } finally {
    busy = false;
    document
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => (button.disabled = false));
    if (report) renderHistory();
  }
}
$("connect-form").addEventListener("submit", (event) => {
  event.preventDefault();
  // Request optional host access directly from the user gesture.
  const server = extension
    ? ($("server") as HTMLInputElement).value.trim()
    : "";
  const entered = ($("token") as HTMLInputElement).value.trim();
  let permission: Promise<boolean> = Promise.resolve(true);
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
$("logout")?.addEventListener("click", () => {
  sessionStorage.removeItem("myzilla-token");
  location.reload();
});
for (const type of ["toggle", "import", "sync"])
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
    days = Number(button.dataset.days);
    document
      .querySelectorAll("[data-days]")
      .forEach((b) => b.classList.toggle("selected", b === button));
    void run(refresh);
  }),
);
$("metric").addEventListener("change", () => {
  metric = ($("metric") as HTMLSelectElement).value as typeof metric;
  render();
});
let searchTimer: ReturnType<typeof setTimeout>;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchGeneration++;
  searchTimer = setTimeout(() => {
    offset = 0;
    void loadHistory().catch((error) => message(error.message, true));
  }, 250);
});
$("previous").addEventListener("click", () => {
  offset = Math.max(0, offset - 200);
  void run(loadHistory);
});
$("next").addEventListener("click", () => {
  if (offset + 200 < totalMatches) {
    offset += 200;
    void run(loadHistory);
  }
});
bounds();
void run(async () => {
  if (extension) await status();
  if (token) await refresh();
});

if (extension)
  setInterval(() => {
    if (!busy && !document.querySelector("input:focus"))
      void status().catch((error) => message(error.message, true));
  }, 5000);
