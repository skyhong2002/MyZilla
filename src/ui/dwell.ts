import { captureButton } from "./curation";
import { errorMessage, pendingUI, focusHeading } from "./ux";
type Api = (path: string) => Promise<any>;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const duration = (n: number) => {
  const s = Math.round(n / 1000);
  return s < 60
    ? `${s} 秒`
    : s < 3600
      ? `${Math.floor(s / 60)} 分 ${s % 60} 秒`
      : `${Math.floor(s / 3600)} 小時 ${Math.floor((s % 3600) / 60)} 分`;
};
export function dwellPanel(api: Api) {
  const root = document.getElementById("dwell-panel")!;
  let from = 0,
    to = 0,
    threshold =
      sessionStorage.getItem("myzilla-dwell-threshold") === "60" ? 60 : 180,
    offset = 0,
    query = "",
    generation = 0;
  async function load(start: number, end: number) {
    if (from !== start || to !== end) offset = 0;
    from = start;
    to = end;
    const v = ++generation;
    const focused = root.contains(document.activeElement);
    root.querySelector("[data-dwell-status]")?.remove();
    const status = document.createElement("p");
    status.dataset.dwellStatus = "";
    status.setAttribute("role", "status");
    status.textContent = "正在估算相鄰造訪的停留時間…";
    root.prepend(status);
    const finish = pendingUI(root, false);
    try {
      const d = await api(
        "/api/dwell?" +
          new URLSearchParams({
            from: String(from),
            to: String(to),
            threshold: String(threshold),
            offset: String(offset),
            q: query,
          }),
      );
      if (v !== generation) return;
      document.getElementById("estimated-stat")!.textContent = d.intervals
        ? duration(d.totalMilliseconds)
        : "無可估算區間";
      document.getElementById("estimated-label")!.textContent =
        `歷史推估 · 小於 ${threshold / 60} 分鐘`;
      root.innerHTML = `<article class="recap-chapter"><span>03 / 留下的時間 · 歷史推估</span><strong>${d.intervals ? duration(d.totalMilliseconds) : "無可估算區間"}</strong><p>由 ${d.intervals.toLocaleString()} 段相鄰造訪估算，涵蓋 ${d.totalPages.toLocaleString()} 個網址。</p></article><label>只計入相鄰造訪間隔<select id="dwell-threshold"><option value="60" ${threshold === 60 ? "selected" : ""}>小於 1 分鐘</option><option value="180" ${threshold === 180 ? "selected" : ""}>小於 3 分鐘</option></select></label><p class="note">這是相鄰造訪間隔推估，不等於實際閱讀時間。<a href="/help.html#time">如何計算？</a></p><details><summary>計算方式與限制</summary><p class="note">同一裝置、瀏覽器與設定檔內，把到下一筆造訪前的時間歸給前一頁。超過門檻、剛好等於門檻或沒有下一筆都不補時間。這是活動間隔推估，多分頁及閒置可能造成誤差；與擴充功能的前景時間分開計算，不相加。跨設定檔的區間可能重疊，總數並非不重複的使用時長。</p></details><h3>各連結的推估停留</h3><form id="dwell-search"><label>搜尋標題或網址<input name="q" type="search" maxlength="2000" value="${esc(query)}"></label><button>搜尋連結</button>${query ? '<button type="button" data-dwell-clear>清除搜尋</button>' : ""}</form><p>${d.matchedPages.toLocaleString()} 個連結，依推估時間排序</p><div class="table-scroll"><table class="sites-table"><thead><tr><th>頁面</th><th>推估停留</th><th>有效區間</th></tr></thead><tbody>${d.pages.map((p: any) => `<tr><td><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title || p.url)}</a><small style="display:block;overflow-wrap:anywhere">${esc(p.url)}</small>${location.protocol.startsWith("http") ? captureButton({ url: p.url, title: p.title || p.url }) : ""}</td><td>${duration(p.milliseconds)}</td><td>${p.intervals}</td></tr>`).join("")}</tbody></table></div><div class="pagination"><button data-dwell-prev ${offset === 0 ? "disabled" : ""}>上一頁</button><span>${d.matchedPages ? offset + 1 : 0}–${Math.min(offset + 50, d.matchedPages)} / ${d.matchedPages}</span><button data-dwell-next ${offset + 50 >= d.matchedPages ? "disabled" : ""}>下一頁</button></div><details><summary>未納入的紀錄</summary><p>重複網址與時間：${d.excluded.duplicates}；同時間多頁無法歸屬：${d.excluded.ambiguous}；達到／超過門檻：${d.excluded.longGaps}；沒有下一筆：${d.excluded.lastVisits}；非安全網頁來源：${d.excluded.nonWeb}。</p><p>以上為目前期間的排除計數。分析保留期間外相鄰紀錄，再將有效時間裁切到目前期間；原始歷史不修改。</p></details>`;
      if (focused) focusHeading(root);
    } catch (e) {
      if (v === generation) {
        status.innerHTML =
          esc(errorMessage(e)) +
          " 先前結果若仍顯示，尚未更新。<button data-dwell-retry>重試</button>";
        document.getElementById("estimated-stat")!.textContent = "讀取失敗";
      }
    } finally {
      finish();
    }
  }
  root.addEventListener("change", (event) => {
    const el = event.target as HTMLSelectElement;
    if (el.id !== "dwell-threshold") return;
    threshold = Number(el.value);
    offset = 0;
    sessionStorage.setItem("myzilla-dwell-threshold", String(threshold));
    void load(from, to);
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    query = String(
      new FormData(event.target as HTMLFormElement).get("q") ?? "",
    );
    offset = 0;
    void load(from, to);
  });
  root.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest("button");
    if (b?.hasAttribute("data-dwell-retry")) {
      void load(from, to);
    } else if (b?.hasAttribute("data-dwell-clear")) {
      query = "";
      offset = 0;
      void load(from, to).then(() =>
        root.querySelector<HTMLInputElement>("input[type=search]")?.focus(),
      );
    } else if (b?.hasAttribute("data-dwell-next")) {
      offset += 50;
      void load(from, to);
    } else if (b?.hasAttribute("data-dwell-prev")) {
      offset = Math.max(0, offset - 50);
      void load(from, to);
    }
  });
  return { load };
}
