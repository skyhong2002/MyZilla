import "./personal-insights.css";
import {
  errorMessage,
  announce,
  pendingUI,
  clearDirty,
  discardChanges,
  focusHeading,
} from "./ux";
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const date = (n: number) => new Date(n).toLocaleDateString("zh-TW");
const time = (n: number) => new Date(n).toLocaleString("zh-TW");
const empty = (s: string) => `<p class="insight-empty">${s}</p>`;
const evidence = (id: string) =>
  `<details class="insight-evidence" data-evidence="${esc(id)}"><summary>查看依據</summary><div></div></details>`;
const link = (p: any) =>
  `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title || p.url)}</a>`;
export function personalInsights(api: Api) {
  let query = "",
    current: any,
    version = 0,
    limit = 12,
    offset = 0,
    search = "";
  const sections: Record<string, string> = {
    map: "topics",
    paths: "paths",
    changes: "changes",
    pairs: "intersections",
    long: "longterm",
  };
  let section = sessionStorage.getItem("myzilla-insight-section") ?? "map";
  if (!sections[section]) section = "map";
  const offsets: Record<string, number> = {};
  let lastFrom = 0,
    lastTo = 0;
  const overview = document.getElementById("personal-overview")!,
    root = document.getElementById("personal-insights")!;
  function render() {
    const d = current;
    if (!d) return;
    const topic = d.highlights.topic;
    const change = d.highlights.change;
    const long = d.highlights.long;
    overview.innerHTML = `<div class="section-heading"><div><h2>你的瀏覽線索</h2><p>從具體內容，找出持續關注、變化與值得找回的頁面。</p></div><a href="#insights" data-view="insights">展開五個面向 →</a></div><div class="personal-cards">
  <article><small>持續關注</small><h3>${topic ? esc(topic.label) : "還需要更多線索"}</h3><p>${topic ? `${topic.days} 個活躍日 · ${topic.pages} 個不同頁面 · ${topic.months} 個月` : "不同日期的相關頁面累積後，會在這裡出現。"}</p>${topic ? evidence(topic.id) : ""}</article>
  <article><small>相較前一期</small><h3>${change ? `${esc(change.label)} · ${change.type}` : "尚無足夠比較資料"}</h3><p>${change ? `頁面 × 天數 ${change.previous} → ${change.current}，占比變化 ${change.delta > 0 ? "+" : ""}${change.delta} 個百分點。` : "需要兩個期間都有可分析內容，才會描述變化。"}</p>${change ? evidence(change.id) : ""}</article>
  <article><small>${long?.dormant ? "值得找回" : "長期回訪"}</small><h3>${long ? link(long) : "跨月線索還在累積"}</h3><p>${long ? `${long.months} 個月、${long.days} 天曾回來；最後一次 ${date(long.last)}。` : "在不同月份反覆查閱的內容會出現在這裡。"}</p></article></div>`;
    const tiles = d.topics
      .map(
        (t: any) =>
          `<article class="topic-card"><div class="topic-head"><h3>${esc(t.label)}</h3><span>${t.mode === "work" ? "工作需要" : t.kind === "rule" ? "規則線索" : "標題關鍵詞"}</span></div><p>${t.days} 天 · ${t.months} 個月 · ${t.pages} 頁 · ${t.sites} 站</p><meter min="0" max="${d.topics[0]?.score || 1}" value="${t.score}" aria-label="${esc(t.label)}的持續出現程度"></meter>${evidence(t.id)}<details><summary>調整這個主題</summary><form data-topic="${t.id}"><label>主題名稱<input name="label" maxlength="80" value="${esc(t.label)}"></label><label>這對我的意義<select name="mode"><option value="interest" ${t.mode === "interest" ? "selected" : ""}>關注的內容</option><option value="work" ${t.mode === "work" ? "selected" : ""}>只是工作需要</option><option value="exclude">分類不準／不重要，排除</option></select></label><button>儲存調整</button></form></details></article>`,
      )
      .join("");
    root.innerHTML = `<div class="section-heading"><div><h2>看見你的關注方式</h2><p>從 ${d.pages.toLocaleString()} 個頁面，整理持續關注與探索中的變化。<a href="/help.html#insights">如何解讀？</a></p></div></div><details class="insight-method"><summary>分析依據與範圍</summary><p>${d.selected.toLocaleString()} 筆造訪，${d.eligible.toLocaleString()} 筆參與分析；主題涵蓋 ${d.matchedPages.toLocaleString()} 個頁面。${d.utility.toLocaleString()} 筆工具／空白頁與 ${d.nonWeb.toLocaleString()} 筆非網頁紀錄未參與分析，歷史完整保留。依標題與網址判斷，可能分類不準，可逐項修正；同一頁每天只計一次，月份依 ${esc(d.zone)}。主題可重疊，統計不代表實際閱讀時間或人格。</p></details>
  <form data-insight-search><label>搜尋主題或頁面<input name="search" type="search" maxlength="200" value="${esc(search)}" placeholder="例如口琴、部署、電影"></label><button>搜尋洞察</button>${search ? '<button type="button" data-insight-clear>清除搜尋</button>' : ""}</form><nav class="insight-jumps" aria-label="五個洞察面向">${[
    ["map", "興趣地圖"],
    ["paths", "探索路徑"],
    ["changes", "近期變化"],
    ["pairs", "興趣交集"],
    ["long", "長期線索"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" data-jump="${id}" aria-pressed="${id === section}" aria-controls="insight-${id}">${label}</button>`,
    )
    .join("")}</nav><p id="insight-message" role="status"></p>
  <section id="insight-map"><h2>01 · 我的興趣地圖</h2><p>跨不同日期持續出現的內容。${d.counts.topics} 個主題，顯示 ${d.topics.length} 個。</p><div class="topic-grid">${tiles || empty("此期間尚無跨兩天、至少兩個頁面的主題線索。")}</div></section>
  <section id="insight-paths"><h2>02 · 我的探索路徑</h2><p>同一裝置、瀏覽器與設定檔內，間隔不超過 30 分鐘的相關活動。依造訪時間排列，可能包含多分頁活動。共 ${d.counts.paths} 段，顯示 ${d.paths.length} 段。</p>${d.paths.map((p: any) => `<article class="insight-block"><h3>${esc(p.topic)}</h3><p>${time(p.start)} — ${time(p.end)} · ${esc(p.source.device)} · ${esc(p.source.browser)} / ${esc(p.source.profile)} · ${p.total} 個不同頁面</p><ol>${p.steps.map((s: any) => `<li><small>${time(s.at)}</small> ${link(s)}</li>`).join("")}</ol>${evidence(p.id)}</article>`).join("") || empty("目前沒有符合條件的探索片段。")}</section>
  <section id="insight-changes"><h2>03 · 最近的我有什麼不同</h2><p>${d.comparison.anchoredToLatest ? "以資料最後一筆為基準的 30 天，並非此刻的最近 30 天。" : ""}本期 ${date(d.comparison.from)}—${date(d.comparison.to - 1)}，對照 ${date(d.comparison.previousFrom)}—${date(d.comparison.previousTo - 1)}。以不同頁面 × 日期的占比比較。${d.counts.changes} 項，顯示 ${d.changes.length} 項。</p>${d.comparison.comparable ? `<div class="personal-cards">${d.changes.map((t: any) => `<article><small>${t.type}</small><h3>${esc(t.label)}</h3><p>${t.previous} → ${t.current} 頁面 × 天數</p><strong>${t.delta > 0 ? "+" : ""}${t.delta} 個百分點</strong>${evidence(t.id)}</article>`).join("") || empty("兩期的內容分布沒有達到顯示門檻的變化。")}</div>` : empty("其中一期沒有內容紀錄，暫不判定升溫或淡出。")}</section>
  <section id="insight-pairs"><h2>04 · 我的興趣交集</h2><p>在同一頁面相遇、跨不同日期出現的主題。${d.counts.intersections} 組，顯示 ${d.intersections.length} 組。</p><div class="personal-cards">${d.intersections.map((p: any) => `<article><h3>${esc(p.a)} × ${esc(p.b)}</h3><p>${p.pages} 個共同頁面 · ${p.days} 天</p>${evidence(p.id)}</article>`).join("") || empty("目前沒有足夠的跨主題共同頁面。")}</div></section>
  <section id="insight-long"><h2>05 · 我的長期線索</h2><p>至少跨兩個月份、三天回訪的同一內容。超過 30 天未回訪會標為「值得找回」，以資料最後一筆為基準。${d.counts.longterm} 頁，顯示 ${d.longterm.length} 頁。</p>${d.longterm.map((p: any) => `<article class="insight-block"><small>${p.dormant ? "值得找回" : "持續回訪"}</small><h3>${link(p)}</h3><p>${p.months} 個月 · ${p.days} 天 · ${date(p.first)}—${date(p.last)}</p></article>`).join("") || empty("此期間尚無跨月反覆回訪的頁面，可切換「全部」查看長期紀錄。")}</section>
  <p>${d.counts[sections[section]] ? offset + 1 : 0}–${Math.min(offset + limit, d.counts[sections[section]])} / ${d.counts[sections[section]]} 項</p>${offset > 0 ? "<button data-insight-prev>上一頁洞察</button>" : ""}${d.counts[sections[section]] > offset + limit ? "<button data-insight-next>下一頁洞察</button>" : ""}<details><summary>我的主題調整（${d.feedback.length}）</summary>${d.feedback.map((f: any) => `<p>${esc(f.label || f.topic)} · ${f.mode === "exclude" ? "已排除" : f.mode === "work" ? "工作需要" : "自訂名稱"} <button data-reset-topic="${f.topic}">恢復自動判斷</button></p>`).join("") || "<p>尚無調整。</p>"}</details>`;
    for (const id of Object.keys(sections)) {
      const el = document.getElementById("insight-" + id)!;
      el.hidden = id !== section;
    }
    for (const detail of document.querySelectorAll<HTMLDetailsElement>(
      "[data-evidence]",
    )) {
      const title = detail.closest("article")?.querySelector("h3")?.textContent;
      detail
        .querySelector("summary")
        ?.setAttribute("aria-label", `查看「${title ?? "此項目"}」的依據`);
    }
  }
  async function load(from: number, to: number) {
    lastFrom = from;
    lastTo = to;
    if (current && (current.from !== Math.max(0, from) || current.to !== to)) {
      offset = 0;
      for (const id of Object.keys(offsets)) delete offsets[id];
    }
    const v = ++version;
    query = new URLSearchParams({
      from: String(Math.max(0, from)),
      to: String(to),
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).toString();
    root.setAttribute("aria-busy", "true");
    if (!current)
      overview.innerHTML = root.innerHTML =
        '<p role="status">正在整理你的內容線索…</p>';
    else {
      const status = document.getElementById("insight-message");
      if (status) status.textContent = "正在更新，目前仍顯示上次結果…";
    }
    try {
      const data = await api(
        `/api/insights?${query}&limit=${limit}&offset=${offset}&q=${encodeURIComponent(search)}`,
      );
      if (v !== version) return;
      const total = data.counts[sections[section]];
      if (offset > 0 && offset >= total) {
        offset = Math.max(0, Math.floor((total - 1) / limit) * limit);
        await load(from, to);
        return;
      }
      current = data;
      root.removeAttribute("aria-busy");
      render();
    } catch (e) {
      if (v === version) {
        root.removeAttribute("aria-busy");
        const message = errorMessage(e);
        announce(message, true);
        if (!current)
          overview.innerHTML = root.innerHTML =
            empty(esc(message)) +
            "<button data-insight-retry>重新載入洞察</button>";
        else {
          const status = document.getElementById("insight-message");
          if (status)
            status.innerHTML =
              esc(message) +
              " 目前仍顯示上次結果。 <button data-insight-retry>重試</button>";
        }
      }
    }
  }
  for (const container of [root, overview]) {
    container.addEventListener(
      "toggle",
      async (event) => {
        const detail = event.target as HTMLDetailsElement;
        if (!detail.open || !detail.dataset.evidence || detail.dataset.loaded)
          return;
        const target = detail.querySelector("div")!;
        const fetchPage = async (offset: number) => {
          const focused = target.contains(document.activeElement);
          const finish = pendingUI(target);
          if (!target.textContent) target.textContent = "正在讀取依據…";
          try {
            const r = await api(
              `/api/insights/evidence?${query}&topic=${encodeURIComponent(detail.dataset.evidence!)}&offset=${offset}`,
            );
            detail.dataset.loaded = "1";
            target.innerHTML = `<p>${r.total} 個頁面／步驟 · 第 ${r.total ? offset + 1 : 0}–${Math.min(offset + 20, r.total)} 項</p><ul>${r.items.map((p: any) => `<li>${link(p)}<br><small>${time(p.last)}${p.days ? ` · ${p.days} 個不同日期` : ""}</small></li>`).join("")}</ul>${offset > 0 ? "<button data-prev>上一頁</button>" : ""}${offset + 20 < r.total ? "<button data-next>下一頁</button>" : ""}`;
            if (focused) {
              target.tabIndex = -1;
              target.focus({ preventScroll: true });
            }
            target
              .querySelector("[data-prev]")
              ?.addEventListener("click", () => void fetchPage(offset - 20));
            target
              .querySelector("[data-next]")
              ?.addEventListener("click", () => void fetchPage(offset + 20));
          } catch (e) {
            target.innerHTML =
              esc(errorMessage(e)) +
              " <button data-evidence-retry>重試</button>";
            target
              .querySelector("[data-evidence-retry]")!
              .addEventListener("click", () => void fetchPage(offset));
          } finally {
            finish();
          }
        };
        await fetchPage(0);
      },
      true,
    );
  }
  root.addEventListener("submit", async (event) => {
    const form = event.target as HTMLFormElement;
    if (form.hasAttribute("data-insight-search")) {
      event.preventDefault();
      if (!(await discardChanges(root))) return;
      for (const id of Object.keys(offsets)) delete offsets[id];
      search = String(new FormData(form).get("search") ?? "");
      offset = 0;
      await load(current.from, current.to);
      return;
    }
    if (!form.dataset.topic) return;
    event.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const data = new FormData(form);
    const finish = pendingUI(form);
    try {
      await api("/api/insights/feedback", "PUT", {
        topic: form.dataset.topic,
        label: data.get("label"),
        mode: data.get("mode"),
      });
      clearDirty(form);
      await load(current.from, current.to);
      focusHeading(document.getElementById("insight-map")!);
      announce("主題調整已儲存，可在「我的主題調整」恢復。");
    } catch (e) {
      const message = errorMessage(e);
      announce(message, true);
      document.getElementById("insight-message")!.textContent = message;
    } finally {
      finish();
    }
  });
  root.addEventListener("click", async (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!b) return;
    if (b.dataset.jump) {
      if (!(await discardChanges(root))) return;
      offsets[section] = offset;
      section = b.dataset.jump;
      sessionStorage.setItem("myzilla-insight-section", section);
      offset = offsets[section] ?? 0;
      await load(current.from, current.to);
      focusHeading(document.getElementById("insight-" + section)!);
      return;
    }
    if (b.hasAttribute("data-insight-retry")) {
      await load(lastFrom, lastTo);
      return;
    }
    if (b.hasAttribute("data-insight-clear")) {
      if (!(await discardChanges(root))) return;
      for (const id of Object.keys(offsets)) delete offsets[id];
      search = "";
      offset = 0;
      await load(current.from, current.to);
      root.querySelector<HTMLInputElement>("input[type=search]")?.focus();
      return;
    }
    try {
      if (
        b.hasAttribute("data-insight-next") ||
        b.hasAttribute("data-insight-prev")
      ) {
        if (!(await discardChanges(root))) return;
        offset = Math.max(
          0,
          offset + (b.hasAttribute("data-insight-next") ? limit : -limit),
        );
        await load(current.from, current.to);
        focusHeading(document.getElementById("insight-" + section)!);
      }
      if (b.dataset.resetTopic) {
        if (!(await discardChanges(root))) return;
        await api("/api/insights/feedback/" + b.dataset.resetTopic, "DELETE");
        await load(current.from, current.to);
      }
    } catch (e) {
      document.getElementById("insight-message")!.textContent = (
        e as Error
      ).message;
    }
  });
  overview.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-insight-retry]"))
      void load(lastFrom, lastTo);
  });
  return { load };
}
