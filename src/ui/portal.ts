import "./portal.css";
import { engines, scopes, type PortalItem } from "../portal/model";
const root = document.getElementById("portal")!;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
const labels: Record<string, string> = {
  bookmark: "我的網址",
  article: "我的網摘",
  movie: "我的電影",
  mood: "我的心情",
  search: "搜尋記錄",
  links: "MyURL 短網址",
  online: "線上使用者",
  tools: "匯入與工具",
  about: "關於 MyZilla",
};
const moods = {
  happy: "開心",
  calm: "平靜",
  busy: "忙碌",
  tired: "疲憊",
  sad: "低落",
};
let me: any,
  listing: any = { items: [], total: 0 },
  notice = "",
  busy = false,
  editing: any;
let params = new URL(location.href).searchParams;
let kind = Object.hasOwn(labels, location.hash.slice(1))
  ? location.hash.slice(1)
  : "bookmark";
let scope = params.get("scope") ?? "all",
  query = params.get("q") ?? "",
  sort = params.get("sort") ?? "recent",
  offset = Math.max(0, Number(params.get("offset")) || 0),
  audience = params.get("audience") === "friends" ? "friends" : "mine";
const token = () => sessionStorage.getItem("myzilla-token") ?? "";
const options = (values: Record<string, string>, selected: string) =>
  Object.entries(values)
    .map(
      ([id, name]) =>
        `<option value="${id}" ${id === selected ? "selected" : ""}>${esc(name)}</option>`,
    )
    .join("");
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!r.ok) {
    if (r.status === 401) {
      me = undefined;
      sessionStorage.removeItem("myzilla-token");
      render();
    }
    const value = await r.json().catch(() => ({}));
    throw Error(value.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}
function state() {
  const u = new URL(location.href);
  u.hash = kind;
  u.search = "";
  for (const [key, value] of Object.entries({
    scope,
    q: query,
    sort,
    offset: String(offset),
    audience,
  }))
    u.searchParams.set(key, value);
  history.pushState(null, "", u);
}
function header() {
  return `<header><a class="wordmark" href="/"><img class="portal-logo" src="./myzilla-mark.svg" width="96" height="72" alt="">MyZilla<span>我的個人入口</span></a><p>搜尋、收藏、回顧，從自己的生活出發。</p></header><nav class="top-nav" aria-label="主要導覽"><a href="/#bookmark">我的入口</a><a href="/dashboard.html">瀏覽回顧</a><a href="/community.html#interests">興趣分析</a><a href="/community.html#friends">朋友與配對</a><a href="/community.html#shares">摘要分享</a><a href="/community.html">帳號設定</a>${me ? '<button data-action="logout">登出</button>' : '<a href="/community.html">登入／註冊</a>'}</nav>`;
}
function sidebar() {
  return `<aside><section><h2>搜尋我的網址</h2><form data-form="find"><label class="sr-only" for="find-query">搜尋收藏</label><input id="find-query" name="query" value="${esc(query)}" placeholder="標題、網址或標籤"><button>搜尋</button></form><label>排序<select id="sort">${options({ recent: "最近使用", clicks: "點閱次數", created: "最新加入" }, sort)}</select></label></section><section><h2>快速搜尋</h2><form data-form="search"><label>關鍵字<input name="query" required maxlength="2000"></label><label>搜尋引擎<select name="engine">${options(Object.fromEntries(Object.entries(engines).map(([id, value]) => [id, value.label])), "google")}</select></label><button>搜尋並記錄</button><small>送至所選搜尋網站；記錄僅自己可見。</small></form></section><section><h2>功能選單</h2><label>選單模式<select id="menu-mode">${options({ basic: "基本選單", search: "搜尋選單", movies: "電影選單", advance: "進階選單", develop: "開發與工具" }, sessionStorage.getItem("portal-menu") ?? "advance")}</select></label><nav aria-label="功能選單">${Object.entries(
    labels,
  )
    .map(
      ([id, label]) =>
        `<a href="#${id}" ${id === kind ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join(
      "",
    )}<a href="/dashboard.html#history">瀏覽記錄</a><a href="/dashboard.html#settings">擴充功能與同步</a></nav><label>生活分類<select id="scope">${options({ all: "全部", ...scopes }, scope)}</select></label></section><section><h2>你的帳號</h2><p>${me ? esc(me.account.name) : "尚未登入"}</p>${me ? `<p>@${esc(me.account.handle)}</p><label class="check"><input id="online-opt" type="checkbox" ${me.online ? "checked" : ""}>顯示我在線上</label><small>勾選後，站內登入者可看到你的名稱；最近五分鐘開啟入口視為在線。</small>` : '<a href="/community.html">帳號登入／邀請註冊</a>'}</section></aside>`;
}
function render() {
  root.innerHTML = `<div class="portal-shell">${header()}<div class="portal-layout"><main><nav class="quick-nav" aria-label="快速切換">${Object.entries(
    labels,
  )
    .map(([id, label]) => `<a href="#${id}">${label}</a>`)
    .join(
      "",
    )}</nav><div id="notice" role="status" aria-live="polite">${esc(notice)}</div>${me ? content() : `<section class="panel"><h1>歡迎回到自己的入口</h1><p>以帳號登入，或用既有金鑰開啟私人收藏與瀏覽回顧。</p><a class="button" href="/community.html">帳號登入／建立帳號</a><form data-form="unlock"><label>原始存取金鑰<input name="token" type="password" minlength="32" required autocomplete="off"></label><button>開啟我的入口</button></form></section>${about()}`}</main>${sidebar()}</div><footer>MyZilla · 從 2000 年代的個人入口概念重新出發 · <a href="#about">來源與功能說明</a></footer><dialog id="editor"></dialog></div>`;
}
function content() {
  if (kind === "about") return about();
  if (kind === "tools") return tools();
  if (kind === "online")
    return `<h1>線上使用者</h1><p>只列出主動開啟在線顯示、最近五分鐘使用入口的帳號。</p>${listing.users?.map((u: any) => `<article class="item"><strong>${esc(u.name)}</strong> @${esc(u.handle)} <a href="/community.html#friends">加入朋友</a></article>`).join("") || '<p class="empty">目前沒有其他人開啟在線顯示。</p>'}`;
  if (kind === "links")
    return `<h1>MyURL · 可管理短網址</h1><p>從收藏的「建立分享連結」產生。持有連結可開啟該網址；編輯收藏網址會更新轉址目的地。刪除收藏、撤銷或到期後失效。</p>${listing.links?.map((link: any) => `<article class="item"><strong>${esc(link.title)}</strong><p>${link.clicks} 次開啟 · ${esc(new Date(link.expires).toLocaleString("zh-TW"))} 到期</p><button data-action="revoke" data-id="${link.id}">撤銷連結</button></article>`).join("") || '<p class="empty">還沒有分享連結。</p>'}`;
  if (kind === "search")
    return `<h1>我的搜尋記錄</h1><p>只包含從右側快速搜尋送出的關鍵字。</p>${listing.items.map((item: any) => `<article class="item"><strong>${esc(item.query)}</strong><p>${esc(engines[item.engine as keyof typeof engines]?.label)} · ${item.uses} 次 · ${esc(new Date(item.last_used).toLocaleString("zh-TW"))}</p><button data-action="search-again" data-id="${item.id}">再次搜尋</button><button data-action="delete-search" data-id="${item.id}">刪除</button></article>`).join("") || '<p class="empty">尚無搜尋記錄。</p>'}${pagination()}`;
  return `<div class="heading"><h1>${labels[kind]}</h1><button class="primary" data-action="new">新增${kind === "movie" ? "電影" : kind === "mood" ? "心情" : "網址"}</button></div><div class="filters"><label>內容來源<select id="audience">${options({ mine: "自己的收藏", friends: "朋友分享的收藏" }, audience)}</select></label><span>${scope === "all" ? "全部分類" : scopes[scope as keyof typeof scopes]} · ${listing.total ?? 0} 筆</span></div>${audience === "friends" ? '<p class="note">只顯示已接受的朋友主動分享的項目。</p>' : ""}${listing.items.map(itemMarkup).join("") || '<p class="empty">目前沒有項目。新增收藏，或調整搜尋與分類。</p>'}${pagination()}`;
}
function itemMarkup(item: any) {
  return `<article class="item"><div class="heading"><h2>${esc(item.title)}</h2><small>${item.owner ? esc(item.owner.name) : item.visibility === "friends" ? "朋友可見" : "私人"}</small></div>${item.url ? `<p class="item-url">${esc(item.url)}</p>` : ""}<p>${esc(scopes[item.scope as keyof typeof scopes])} ${item.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</p>${item.kind === "movie" ? `<p>評分 ${item.rating || "尚未評分"}${item.rating ? "/10" : ""} · 看過 ${item.watched} 次${item.wishlist ? " · 願望清單" : ""}${item.collection ? ` · 收藏：${esc(item.collection)}` : ""}</p>` : ""}${item.kind === "mood" ? `<p>${esc(moods[item.mood as keyof typeof moods])} · ${esc(new Date(item.created).toLocaleString("zh-TW"))}</p>` : ""}<p class="notes">${esc(item.notes)}</p><small>${item.clicks} 次開啟${item.lastUsed ? " · 最近 " + esc(new Date(item.lastUsed).toLocaleString("zh-TW")) : ""}</small><div class="actions">${item.url ? (item.owner ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">開啟網址 ↗</a>` : `<button data-action="open" data-id="${item.id}">開啟網址 ↗</button>`) : ""}${!item.owner ? `<button data-action="edit" data-id="${item.id}">編輯</button>${item.kind === "movie" ? `<button data-action="movie-summary" data-id="${item.id}">朋友觀影概況</button>` : ""}${item.url ? `<button data-action="link" data-id="${item.id}">建立分享連結</button>` : ""}<button data-action="delete" data-id="${item.id}">刪除</button>` : ""}</div></article>`;
}
function pagination() {
  return `<div class="pagination"><button data-action="previous" ${offset === 0 ? "disabled" : ""}>上 20 項</button><span>${listing.total ? offset + 1 : 0}–${Math.min(offset + 20, listing.total ?? 0)} / ${listing.total ?? 0}</span><button data-action="next" ${offset + 20 >= (listing.total ?? 0) ? "disabled" : ""}>下 20 項</button></div>`;
}
function tools() {
  return `<h1>匯入與工具</h1><section class="panel"><h2>收藏備份與 RSS</h2><p>匯出全部網址、網摘、電影與心情內容；JSON 可分批還原，重送相同 ID 不會重複新增。匯入不會覆蓋既有點閱統計，不含帳號密碼或分享連結。匯入會沿用每筆可見性；朋友可見的項目會分享給目前的朋友。</p><button data-action="export">下載 JSON 備份</button><button data-action="rss">下載私人書籤 RSS</button><form data-form="import"><label>匯入 MyZilla JSON<input type="file" name="file" accept="application/json,.json" required></label><button>匯入全部項目</button></form><p>RSS 是私人匯出檔；訂閱程式也可透過帶 Bearer 驗證的 /api/portal/feed 讀取，沒有匿名訂閱入口。</p></section><section class="panel"><h2>瀏覽器歷史</h2><p>Brave、Chrome、Arc、Dia、Zen 所有設定檔的既有歷史，繼續使用原生 SQLite 工具全量匯入；新活動由擴充功能同步。</p><a href="/dashboard.html#settings">安裝、匯入與同步設定 →</a></section>`;
}
function about() {
  return `<section class="panel"><h1>從舊 MyZilla 帶回來的概念</h1><p>簡潔的個人入口，把搜尋、網址、網摘、生活分類與電影收藏放在一起；現在也能回顧完整瀏覽紀錄、管理帳號與朋友。</p><p>參考 <a href="https://web.archive.org/web/20070714011435/http://myzilla.tw/myzilla.php" target="_blank" rel="noopener noreferrer">2007 年原站存檔</a>及 <a href="https://myzilla.wikidot.com/" target="_blank" rel="noopener noreferrer">MyZilla Wiki</a>。這是重新實作，非原站營運延續。</p><ul><li>我的網址／MyURL：收藏、生活分類、標籤、排序、轉址分享。</li><li>快速搜尋：多站搜尋與私人關鍵字記錄。</li><li>MyMovie：評分、觀看次數、願望清單、收藏媒體與筆記。</li><li>MyBlog／心情：網摘、RSS 匯出、心情記錄及主動分享。</li><li>新版：跨瀏覽器同步、興趣分析、朋友配對與限時摘要分享。</li></ul><p>原站部分登入後細節未被存檔；已停用的外部搜尋服務不保留失效入口。部落格全網排行榜、流量追蹤和當年規劃中的遊戲屬其他專案，沒有偽造資料或成品。</p></section>`;
}
function editor(item?: any) {
  editing = item ?? {
    id: crypto.randomUUID(),
    kind,
    scope: scope === "all" ? "personal" : scope,
    visibility: "private",
    tags: [],
    rating: 0,
    watched: 0,
    wishlist: false,
    mood: "calm",
  };
  const v = editing;
  const dialog = document.getElementById("editor") as HTMLDialogElement;
  dialog.innerHTML = `<form data-form="save"><h2>${item ? "編輯" : "新增"}${labels[v.kind]}</h2><label>標題<input name="title" value="${esc(v.title)}" maxlength="500" required></label>${v.kind !== "mood" ? `<label>網址${["movie"].includes(v.kind) ? "（選填）" : ""}<input name="url" type="url" value="${esc(v.url)}" ${v.kind === "movie" ? "" : "required"} maxlength="8000"></label>` : ""}<label>生活分類<select name="scope">${options(scopes, v.scope)}</select></label><label>標籤（逗號分隔）<input name="tags" value="${esc(v.tags.join(", "))}"></label><label>筆記／評論<textarea name="notes" maxlength="10000" rows="4">${esc(v.notes)}</textarea></label>${v.kind === "movie" ? `<div class="form-grid"><label>評分（0 表示未評分）<input name="rating" type="number" min="0" max="10" value="${v.rating}"></label><label>看過幾次<input name="watched" type="number" min="0" max="100000" value="${v.watched}"></label></div><label>收藏媒體<input name="collection" value="${esc(v.collection)}" placeholder="DVD、Blu-ray、數位…" maxlength="500"></label><label class="check"><input name="wishlist" type="checkbox" ${v.wishlist ? "checked" : ""}>加入願望清單</label>` : ""}${v.kind === "mood" ? `<label>目前心情<select name="mood">${options(moods, v.mood)}</select></label>` : ""}<label>誰能看<select name="visibility">${options({ private: "只有自己", friends: "已接受的朋友" }, v.visibility)}</select></label><p class="note">選擇朋友可見時，朋友能看見此項目的標題、網址、標籤與筆記／評論；不會因此取得瀏覽歷史。</p><div class="actions"><button class="primary">儲存</button><button type="button" data-action="close">取消</button></div></form>`;
  dialog.showModal();
}
async function load() {
  if (!token()) {
    me = undefined;
    render();
    return;
  }
  me = await api("/api/portal/me");
  if (["bookmark", "article", "movie", "mood"].includes(kind))
    listing = await api(
      "/api/portal/items?" +
        new URLSearchParams({
          kind,
          scope,
          q: query,
          sort,
          offset: String(offset),
          audience,
        }),
    );
  else if (kind === "search")
    listing = await api("/api/portal/searches?offset=" + offset);
  else if (["links", "online"].includes(kind))
    listing = await api("/api/portal/" + kind);
  render();
  const incoming = new URL(location.href);
  if (incoming.searchParams.has("captureUrl")) {
    kind = "bookmark";
    editor({
      id: crypto.randomUUID(),
      kind,
      title:
        incoming.searchParams.get("captureTitle") ||
        incoming.searchParams.get("captureUrl"),
      url: incoming.searchParams.get("captureUrl"),
      scope: "personal",
      visibility: "private",
      tags: [],
      notes: "",
      rating: 0,
      watched: 0,
      wishlist: false,
      mood: "calm",
    });
    incoming.searchParams.delete("captureUrl");
    incoming.searchParams.delete("captureTitle");
    history.replaceState(null, "", incoming);
  }
}
async function run(job: () => Promise<void>) {
  if (busy) return;
  busy = true;
  root.setAttribute("aria-busy", "true");
  try {
    await job();
  } catch (e) {
    notice = e instanceof Error ? e.message : "操作失敗";
    const el = document.getElementById("notice");
    if (el) el.textContent = notice;
    const dialog = document.getElementById("editor") as HTMLDialogElement;
    if (dialog?.open) {
      let error = dialog.querySelector<HTMLElement>("[role=alert]");
      if (!error) {
        error = document.createElement("p");
        error.setAttribute("role", "alert");
        dialog.prepend(error);
      }
      error.textContent = notice;
    }
  } finally {
    busy = false;
    root.removeAttribute("aria-busy");
  }
}
async function external(path: string, body?: unknown) {
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  try {
    const result = await api(path, "POST", body);
    if (popup) popup.location.href = result.url;
    else notice = "瀏覽器阻擋新分頁，請允許彈出視窗後重試。";
  } catch (e) {
    popup?.close();
    throw e;
  }
}
function download(value: Blob, name: string) {
  const url = URL.createObjectURL(value),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
root.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const fields = new FormData(form),
    input = Object.fromEntries(fields) as Record<string, string>;
  void run(async () => {
    notice = "";
    switch (form.dataset.form) {
      case "unlock":
        sessionStorage.setItem("myzilla-token", input.token.trim());
        break;
      case "find":
        query = input.query;
        offset = 0;
        if (!["bookmark", "article", "movie", "mood"].includes(kind))
          kind = "bookmark";
        state();
        break;
      case "search":
        await external("/api/portal/search", input);
        kind = "search";
        offset = 0;
        state();
        break;
      case "save": {
        const payload = {
          ...editing,
          ...input,
          tags: input.tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          rating: Number(input.rating ?? 0),
          watched: Number(input.watched ?? 0),
          wishlist: input.wishlist === "on",
        };
        await api("/api/portal/items/" + editing.id, "PUT", payload);
        (document.getElementById("editor") as HTMLDialogElement).close();
        notice = "已儲存";
        break;
      }
      case "link": {
        const result = await api(
          "/api/portal/items/" + input.id + "/link",
          "POST",
          { days: Number(input.days) },
        );
        (document.getElementById("editor") as HTMLDialogElement).close();
        notice = "分享連結（請複製保存）：" + location.origin + result.path;
        break;
      }
      case "import": {
        const file = fields.get("file") as File;
        const backup = JSON.parse(await file.text());
        if (backup.version !== 1 || !Array.isArray(backup.items))
          throw Error("請選擇 MyZilla JSON 備份");
        let accepted = 0,
          rejected = 0;
        const errors: string[] = [];
        for (const item of backup.items) {
          try {
            await api(
              "/api/portal/items/" + encodeURIComponent(item.id),
              "PUT",
              item,
            );
            accepted++;
          } catch (e) {
            rejected++;
            errors.push(
              `${accepted + rejected}: ${e instanceof Error ? e.message : "失敗"}`,
            );
          }
          const el = document.getElementById("notice");
          if (el)
            el.textContent = `匯入進度 ${accepted + rejected}/${backup.items.length}`;
        }
        notice = `匯入完成：接受 ${accepted}、拒收 ${rejected}。重送相同 ID 不會新增重複項目。`;
        if (errors.length)
          download(
            new Blob([JSON.stringify(errors, null, 2)], {
              type: "application/json",
            }),
            "myzilla-import-errors.json",
          );
        break;
      }
    }
    await load();
  });
});
root.addEventListener("click", (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
    'a[href^="#"]',
  );
  if (
    link &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    if (busy) return;
    kind = link.hash.slice(1);
    offset = 0;
    notice = "";
    state();
    void run(load);
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-action]",
  );
  if (!button) return;
  const id = button.dataset.id,
    action = button.dataset.action,
    item = listing.items?.find((row: any) => row.id === id);
  if (action === "new") {
    editor();
    return;
  }
  if (action === "edit") {
    editor(item);
    return;
  }
  if (action === "close") {
    (document.getElementById("editor") as HTMLDialogElement).close();
    return;
  }
  if (action === "link") {
    const dialog = document.getElementById("editor") as HTMLDialogElement;
    dialog.innerHTML = `<form data-form="link"><h2>分享轉址連結</h2><p>持有連結的人都可開啟「${esc(item.title)}」的網址。筆記與其他收藏不會公開。編輯此收藏會更新目的地。</p><input type="hidden" name="id" value="${id}"><label>有效期<select name="days">${options({ "1": "1 天", "7": "7 天", "30": "30 天" }, "7")}</select></label><button>建立連結</button><button type="button" data-action="close">取消</button></form>`;
    dialog.showModal();
    return;
  }
  void run(async () => {
    notice = "";
    switch (action) {
      case "logout":
        await api("/api/community/logout", "POST");
        sessionStorage.removeItem("myzilla-token");
        break;
      case "movie-summary": {
        const value = await api("/api/portal/items/" + id + "/movie-summary");
        const dialog = document.getElementById("editor") as HTMLDialogElement;
        dialog.innerHTML = `<h2>自己與朋友的觀影概況</h2><p>只計自己及已接受朋友主動分享的電影，每人採最新一筆；以${esc(value.matching)}比對。</p><p>${value.people} 人收藏此片 · ${value.rated} 人評分 · 平均 ${value.average ?? "未評分"}${value.average !== null ? "/10" : ""}</p><p>${value.watchedPeople} 人看過，共 ${value.watchedTotal} 次 · ${value.wishlist} 人列入願望清單 · ${value.collections} 人登記收藏媒體</p><button data-action="close">關閉</button>`;
        dialog.showModal();
        return;
      }
      case "open":
        await external("/api/portal/items/" + id + "/open");
        break;
      case "delete":
        if (!confirm("刪除此項目？相關分享連結也會失效。")) return;
        await api("/api/portal/items/" + id, "DELETE");
        break;
      case "delete-search":
        await api("/api/portal/searches/" + id, "DELETE");
        break;
      case "search-again":
        await external("/api/portal/search", {
          engine: item.engine,
          query: item.query,
        });
        break;
      case "revoke":
        await api("/api/portal/links/" + id, "DELETE");
        notice = "連結已撤銷";
        break;
      case "previous":
        offset = Math.max(0, offset - 20);
        state();
        break;
      case "next":
        offset += 20;
        state();
        break;
      case "export":
        download(
          new Blob([JSON.stringify(await api("/api/portal/export"), null, 2)], {
            type: "application/json",
          }),
          "myzilla-collections.json",
        );
        return;
      case "rss": {
        const r = await fetch("/api/portal/feed", {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!r.ok) throw Error("RSS 匯出失敗");
        download(await r.blob(), "myzilla-bookmarks.rss");
        return;
      }
    }
    await load();
  });
});
root.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  void run(async () => {
    if (target.id === "scope") scope = target.value;
    else if (target.id === "sort") sort = target.value;
    else if (target.id === "audience") audience = target.value;
    else if (target.id === "menu-mode") {
      sessionStorage.setItem("portal-menu", target.value);
      kind = (
        {
          basic: "bookmark",
          search: "search",
          movies: "movie",
          advance: "article",
          develop: "tools",
        } as any
      )[target.value];
    } else if (target.id === "online-opt") {
      await api("/api/portal/preferences", "PUT", {
        online: (target as unknown as HTMLInputElement).checked,
      });
    } else return;
    offset = 0;
    state();
    await load();
  });
});
const restore = () => {
  params = new URL(location.href).searchParams;
  scope = params.get("scope") ?? "all";
  query = params.get("q") ?? "";
  sort = params.get("sort") ?? "recent";
  offset = Math.max(0, Number(params.get("offset")) || 0);
  audience = params.get("audience") === "friends" ? "friends" : "mine";
  kind = Object.hasOwn(labels, location.hash.slice(1))
    ? location.hash.slice(1)
    : "bookmark";
  void run(load);
};
addEventListener("popstate", restore);
addEventListener("hashchange", restore);
render();
void run(load);
