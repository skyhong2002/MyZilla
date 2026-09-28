import "./portal.css";
import {
  installUX,
  pendingUI,
  errorMessage,
  announce,
  confirmAction,
  discardChanges,
  clearDirty,
  copyControl,
  focusHeading,
  reauthenticate,
} from "./ux";
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
  links: "短網址管理",
  online: "線上使用者",
  tools: "匯入與工具",
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
let cancelImport = false;
let loadVersion = 0;
let renderedURL = location.href,
  restoring = false;
installUX(root);
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
      sessionStorage.removeItem("myzilla-token");
      if (me?.account?.id) {
        const ok = await reauthenticate(me.account.id);
        throw Error(
          ok
            ? "登入已恢復，請重新送出剛才的操作。"
            : "尚未登入，輸入仍保留。再次送出即可重新登入。",
        );
      }
      render();
      throw Error("存取金鑰不正確或已失效，請重新輸入，或使用帳號登入。");
    }
    const value = await r.json().catch(() => ({}));
    throw Object.assign(Error(value.error ?? `HTTP ${r.status}`), {
      fields: value.fields,
      status: r.status,
    });
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
  return `<header><a class="wordmark" href="/"><img class="portal-logo" src="./myzilla-mark.svg" width="96" height="72" alt="">MyZilla<span>我的個人入口</span></a><p>搜尋、收藏、回顧，從自己的生活出發。</p></header><nav class="top-nav" aria-label="主要導覽"><a href="/#bookmark" aria-current="page">我的入口</a><a href="/dashboard.html">瀏覽回顧</a><a href="/dashboard.html#settings">匯入與設定</a><a href="/community.html">帳號與朋友</a><a href="/help.html">使用說明</a>${me || token() ? '<button data-action="logout">登出</button>' : '<a href="/community.html">登入</a>'}</nav>`;
}
function sidebar() {
  return `<aside><section><h2>快速搜尋</h2><form data-form="search"><label>關鍵字<input name="query" required maxlength="2000"></label><label>搜尋引擎<select name="engine">${options(Object.fromEntries(Object.entries(engines).map(([id, value]) => [id, value.label])), "google")}</select></label><button>搜尋並記錄</button><small>送至所選搜尋網站；記錄僅自己可見。</small></form></section><section><h2>功能選單</h2><nav aria-label="功能選單">${Object.entries(
    labels,
  )
    .map(
      ([id, label]) =>
        `<a href="#${id}" ${id === kind ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join(
      "",
    )}<a href="/dashboard.html#history">瀏覽記錄</a><a href="/dashboard.html#settings">擴充功能與同步</a></nav></section><section><h2>你的帳號</h2><p>${me ? esc(me.account.name) : token() ? "我的帳號" : "尚未登入"}</p>${me ? `<p>@${esc(me.account.handle)}</p><label class="check"><input id="online-opt" type="checkbox" ${me.online ? "checked" : ""}>顯示我在線上</label><small>勾選後，站內登入者可看到你的名稱；最近五分鐘開啟入口視為在線。</small>` : token() ? "" : '<a href="/community.html">帳號登入／邀請註冊</a>'}</section></aside>`;
}
function render() {
  renderedURL = location.href;
  document.title = `${me || token() ? labels[kind] : "登入"} · MyZilla`;
  root.innerHTML = `<a class="skip-link" href="#portal-main">跳到主要內容</a><div class="portal-shell">${header()}<div class="portal-layout"><main id="portal-main" tabindex="-1"><nav class="quick-nav" aria-label="快速切換">${Object.entries(
    labels,
  )
    .map(
      ([id, label]) =>
        `<a href="#${id}" ${kind === id ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join(
      "",
    )}</nav><div id="notice" role="status" aria-live="polite">${esc(notice)}</div>${copyControl(notice)}${me ? content() : token() ? `<section class="panel"><h1>${labels[kind]}</h1><div class="session-placeholder" aria-label="正在讀取內容"></div></section>` : `<section class="panel"><h1>歡迎回到自己的入口</h1><p>以帳號登入，或用既有金鑰開啟私人收藏與瀏覽回顧。</p><a class="button" href="/community.html">帳號登入／建立帳號</a><form data-form="unlock"><p><a href="/help.html#login">金鑰是什麼？第一次登入說明</a></p><label>存取金鑰<input name="token" type="password" minlength="32" required autocomplete="off"></label><button>開啟我的入口</button></form></section>`}</main>${sidebar()}</div><footer>MyZilla</footer><dialog id="editor" aria-label="收藏編輯與分享"></dialog></div>`;
}
function content() {
  if (kind === "tools") return tools();
  if (kind === "online")
    return `<h1>線上使用者</h1><p>只列出主動開啟在線顯示、最近五分鐘使用入口的帳號。</p>${listing.users?.map((u: any) => `<article class="item"><strong>${esc(u.name)}</strong> @${esc(u.handle)} <a href="/community.html#friends">加入朋友</a></article>`).join("") || '<p class="empty">目前沒有其他人開啟在線顯示。</p>'}`;
  if (kind === "links")
    return `<h1>短網址管理</h1><p>從收藏的「建立分享連結」產生。持有連結可開啟該網址；編輯收藏網址會更新轉址目的地。刪除收藏、撤銷或到期後失效。</p>${listing.links?.map((link: any) => `<article class="item"><strong>${esc(link.title)}</strong><p>${link.clicks} 次開啟 · ${esc(new Date(link.expires).toLocaleString("zh-TW"))} 到期</p><button data-action="revoke" data-id="${link.id}">撤銷連結</button></article>`).join("") || '<p class="empty">還沒有分享連結。</p>'}`;
  if (kind === "search")
    return `<h1>我的搜尋記錄</h1><p>只包含從「快速搜尋」送出的關鍵字。</p>${listing.items.map((item: any) => `<article class="item"><strong>${esc(item.query)}</strong><p>${esc(engines[item.engine as keyof typeof engines]?.label)} · ${item.uses} 次 · ${esc(new Date(item.last_used).toLocaleString("zh-TW"))}</p><button data-action="search-again" data-id="${item.id}">再次搜尋</button><button data-action="delete-search" data-id="${item.id}">刪除</button></article>`).join("") || '<p class="empty">尚無搜尋記錄。</p>'}${pagination()}`;
  return `<div class="heading"><h1>${labels[kind]}</h1><button class="primary" data-action="new">新增${kind === "movie" ? "電影" : kind === "mood" ? "心情" : "網址"}</button></div><form data-form="find"><label for="find-query">搜尋${labels[kind]}<input id="find-query" name="query" type="search" value="${esc(query)}" placeholder="標題、網址或標籤"></label><button>搜尋</button></form><div class="filters"><label>生活分類<select id="scope">${options({ all: "全部", ...scopes }, scope)}</select></label><label>排序<select id="sort">${options({ recent: "最近使用", clicks: "點閱次數", created: "最新加入" }, sort)}</select></label><label>內容來源<select id="audience">${options({ mine: "自己的收藏", friends: "朋友分享的收藏" }, audience)}</select></label><span>${scope === "all" ? "全部分類" : scopes[scope as keyof typeof scopes]} · ${listing.total ?? 0} 筆</span></div>${query || scope !== "all" || audience !== "mine" ? `<div class="filter-summary"><span>${query ? `關鍵字：${esc(query)}` : ""} ${scope !== "all" ? esc(scopes[scope as keyof typeof scopes]) : ""}</span><button data-action="clear-filters">清除篩選</button></div>` : ""}${audience === "friends" ? '<p class="note">只顯示已接受的朋友主動分享的項目。</p>' : ""}${listing.items.map(itemMarkup).join("") || '<p class="empty">目前沒有項目。新增收藏，或調整搜尋與分類。</p>'}${pagination()}`;
}
function itemMarkup(item: any) {
  return `<article class="item"><div class="heading"><h2>${esc(item.title)}</h2><small>${item.owner ? esc(item.owner.name) : item.visibility === "friends" ? "朋友可見" : "私人"}</small></div>${item.url ? `<p class="item-url">${esc(item.url)}</p>` : ""}<p>${esc(scopes[item.scope as keyof typeof scopes])} ${item.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</p>${item.kind === "movie" ? `<p>評分 ${item.rating || "尚未評分"}${item.rating ? "/10" : ""} · 看過 ${item.watched} 次${item.wishlist ? " · 願望清單" : ""}${item.collection ? ` · 收藏：${esc(item.collection)}` : ""}</p>` : ""}${item.kind === "mood" ? `<p>${esc(moods[item.mood as keyof typeof moods])} · ${esc(new Date(item.created).toLocaleString("zh-TW"))}</p>` : ""}<p class="notes">${esc(item.notes)}</p><small>${item.clicks} 次開啟${item.lastUsed ? " · 最近 " + esc(new Date(item.lastUsed).toLocaleString("zh-TW")) : ""}</small><div class="actions">${item.url ? (item.owner ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">開啟網址 ↗</a>` : `<button data-action="open" data-id="${item.id}">開啟網址 ↗</button>`) : ""}${!item.owner ? `<button data-action="edit" data-id="${item.id}">編輯</button>${item.kind === "movie" ? `<button data-action="movie-summary" data-id="${item.id}">朋友觀影概況</button>` : ""}${item.url ? `<button data-action="link" data-id="${item.id}">建立分享連結</button>` : ""}<button data-action="delete" data-id="${item.id}">刪除</button>` : ""}</div></article>`;
}
function pagination() {
  return `<div class="pagination"><button data-action="previous" ${offset === 0 ? "disabled" : ""}>上一頁</button><span>${listing.total ? offset + 1 : 0}–${Math.min(offset + 20, listing.total ?? 0)} / ${listing.total ?? 0}</span><button data-action="next" ${offset + 20 >= (listing.total ?? 0) ? "disabled" : ""}>下一頁</button></div>`;
}
function tools() {
  return `<h1>匯入與工具</h1><section class="panel"><h2>最近刪除的收藏</h2><p>刪除後 10 分鐘內可復原，原分享連結不會恢復。</p>${listing.trash?.map((item: any) => `<div class="source-row"><span>${esc(item.title)} · ${esc(new Date(item.expires).toLocaleTimeString("zh-TW"))} 前可復原</span><button data-action="restore" data-id="${esc(item.id)}">復原收藏</button></div>`).join("") || "<p>目前沒有可復原的收藏。</p>"}</section><section class="panel"><h2>收藏備份與 RSS</h2><p>下載完整收藏備份，或從備份還原。匯入前會確認更新筆數與朋友可見的項目。</p><button data-action="export">下載 JSON 備份</button><button data-action="rss">下載私人書籤 RSS</button><form data-form="import"><label>匯入 MyZilla JSON<input type="file" name="file" accept="application/json,.json" required></label><button>匯入全部項目</button></form><details><summary>備份內容與 RSS 使用方式</summary><p>備份不含帳號密碼或分享連結。RSS 是供自己使用的匯出檔。</p><a href="/help.html#collections">收藏備份與還原說明</a></details></section><section class="panel"><h2>瀏覽器歷史</h2><p>Brave、Chrome、Arc、Dia、Zen 所有設定檔的既有歷史，繼續使用原生 SQLite 工具全量匯入；新活動由擴充功能同步。</p><a href="/dashboard.html#settings">安裝、匯入與同步設定 →</a></section>`;
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
  dialog.innerHTML = `<form data-form="save"><h2>${item ? "編輯" : "新增"}${labels[v.kind]}</h2><label>標題<input name="title" value="${esc(v.title)}" maxlength="500" required></label>${v.kind !== "mood" ? `<label>網址${["movie"].includes(v.kind) ? "（選填）" : ""}<input name="url" type="url" value="${esc(v.url)}" ${v.kind === "movie" ? "" : "required"} maxlength="8000"></label>` : ""}<label>生活分類<select name="scope">${options(scopes, v.scope)}</select></label><label>標籤（逗號分隔）<input name="tags" value="${esc(v.tags.join(", "))}"></label><label>筆記／評論<textarea name="notes" maxlength="10000" rows="4">${esc(v.notes)}</textarea></label>${v.kind === "movie" ? `<div class="form-grid"><label>評分（0 表示未評分）<input name="rating" type="number" min="0" max="10" value="${v.rating}"></label><label>看過幾次<input name="watched" type="number" min="0" max="100000" value="${v.watched}"></label></div><label>收藏媒體<input name="collection" value="${esc(v.collection)}" placeholder="DVD、Blu-ray、數位…" maxlength="500"></label><label class="check"><input name="wishlist" type="checkbox" ${v.wishlist ? "checked" : ""}>加入願望清單</label>` : ""}${v.kind === "mood" ? `<label>目前心情<select name="mood">${options(moods, v.mood)}</select></label>` : ""}<label>誰能看<select name="visibility">${options({ private: "只有自己", friends: "已接受的朋友" }, v.visibility)}</select></label><p class="note">選擇朋友可見時，朋友能看見此項目的標題、網址、標籤與筆記／評論；不會因此取得瀏覽歷史。<a href="/help.html#sharing" target="_blank" rel="noopener noreferrer">分享範圍說明 ↗</a></p><div class="actions"><button class="primary">儲存</button><button type="button" data-action="close">取消</button></div></form>`;
  dialog.showModal();
  dialog.oncancel = (event) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    if (dialog.querySelector("form[data-dirty]")) {
      event.preventDefault();
      void discardChanges(dialog).then((ok) => {
        if (ok) {
          clearDirty(dialog);
          dialog.close();
        }
      });
    }
  };
}
async function load() {
  const version = ++loadVersion,
    credential = token();
  if (!credential) {
    me = undefined;
    render();
    return;
  }
  const nextMe = await api("/api/portal/me");
  let nextListing = listing;
  if (kind === "tools")
    nextListing = { trash: (await api("/api/portal/trash")).items };
  else if (["bookmark", "article", "movie", "mood"].includes(kind))
    nextListing = await api(
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
    nextListing = await api("/api/portal/searches?offset=" + offset);
  else if (["links", "online"].includes(kind))
    nextListing = await api("/api/portal/" + kind);
  if (version !== loadVersion || token() !== credential) return;
  me = nextMe;
  listing = nextListing;
  if (listing.total !== undefined && offset > 0 && offset >= listing.total) {
    offset = Math.max(0, Math.floor((listing.total - 1) / 20) * 20);
    state();
    return load();
  }
  const focused = root.contains(document.activeElement);
  render();
  if (focused) focusHeading(root.querySelector("main")!);
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
async function run(job: () => Promise<void>, blocking = true) {
  if (busy && blocking) return;
  if (blocking) busy = true;
  const finish = pendingUI(root, blocking);
  try {
    await job();
  } catch (e) {
    notice = errorMessage(e);
    announce(notice, true);
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
      dialog
        .querySelectorAll("[data-field-error]")
        .forEach((el) => el.remove());
      dialog.querySelectorAll("[aria-invalid]").forEach((el) => {
        el.removeAttribute("aria-invalid");
        el.removeAttribute("aria-describedby");
      });
      const fields = (e as { fields?: Record<string, string> }).fields ?? {};
      for (const [name, text] of Object.entries(fields)) {
        if (!/^[a-z]+$/.test(name)) continue;
        const field = dialog.querySelector<HTMLElement>(`[name="${name}"]`);
        if (!field) continue;
        const detail = document.createElement("span");
        detail.id = `field-error-${name}`;
        detail.dataset.fieldError = "";
        detail.className = "field-error";
        detail.textContent = text;
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", detail.id);
        field.after(detail);
      }
      queueMicrotask(() =>
        dialog.querySelector<HTMLElement>("[aria-invalid]")?.focus(),
      );
    }
  } finally {
    if (blocking) busy = false;
    finish();
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
        clearDirty(root);
        (document.getElementById("editor") as HTMLDialogElement).close();
        notice = "已儲存";
        announce(notice);
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
        const existing = await api("/api/portal/export");
        const ids = new Set(existing.items.map((i: any) => i.id));
        const replace = backup.items.filter(
          (i: any) => i && ids.has(i.id),
        ).length;
        const shared = backup.items.filter(
          (i: any) => i?.visibility === "friends",
        ).length;
        if (
          !(await confirmAction(
            "確認匯入收藏",
            `共 ${backup.items.length} 筆，其中 ${replace} 筆會更新現有項目，${shared} 筆會分享給已接受的朋友。匯入不會刪除其他收藏。`,
            "開始匯入",
          ))
        )
          return;
        cancelImport = false;
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "停止匯入";
        cancel.dataset.cancelImport = "";
        document.getElementById("notice")!.after(cancel);
        let accepted = 0,
          rejected = 0;
        const errors: string[] = [];
        for (const item of backup.items) {
          if (cancelImport) break;
          try {
            await api(
              "/api/portal/items/" + encodeURIComponent(item?.id ?? ""),
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
        cancel.remove();
        notice = `${cancelImport ? "匯入已停止" : "匯入完成"}：接受 ${accepted}、拒收 ${rejected}、未處理 ${backup.items.length - accepted - rejected}。重送相同 ID 不會新增重複項目。`;
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
  if ((event.target as HTMLElement).closest("[data-cancel-import]")) {
    cancelImport = true;
    return;
  }
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
    if (!Object.hasOwn(labels, link.hash.slice(1))) return;
    event.preventDefault();
    if (busy) return;
    kind = link.hash.slice(1);
    offset = 0;
    notice = "";
    state();
    void run(load, false);
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
    const dialog = document.getElementById("editor") as HTMLDialogElement;
    void discardChanges(dialog).then((ok) => {
      if (ok) {
        clearDirty(dialog);
        dialog.close();
      }
    });
    return;
  }
  if (action === "link") {
    const dialog = document.getElementById("editor") as HTMLDialogElement;
    dialog.innerHTML = `<form data-form="link"><h2>分享轉址連結</h2><p>持有連結的人都可開啟「${esc(item.title)}」的網址。筆記與其他收藏不會公開。編輯此收藏會更新目的地。<a href="/help.html#sharing" target="_blank" rel="noopener noreferrer">分享範圍說明 ↗</a></p><input type="hidden" name="id" value="${id}"><label>有效期<select name="days">${options({ "1": "1 天", "7": "7 天", "30": "30 天" }, "7")}</select></label><button>建立連結</button><button type="button" data-action="close">取消</button></form>`;
    dialog.showModal();
    return;
  }
  void run(async () => {
    notice = "";
    switch (action) {
      case "restore":
        await api("/api/portal/trash/" + id + "/restore", "POST");
        notice = "收藏已復原";
        announce(notice);
        break;
      case "clear-filters":
        query = "";
        scope = "all";
        audience = "mine";
        offset = 0;
        state();
        break;
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
        if (
          !(await confirmAction(
            `刪除「${item.title}」？`,
            "收藏可在 10 分鐘內復原，但已建立的分享連結會永久失效。",
            "刪除收藏",
          ))
        )
          return;
        await api("/api/portal/items/" + id, "DELETE");
        announce("收藏已刪除；原分享連結已失效。", false, {
          label: "復原收藏",
          run: async () => {
            await api("/api/portal/trash/" + id + "/restore", "POST");
            await load();
          },
        });
        break;
      case "delete-search":
        if (
          !(await confirmAction(
            "刪除這筆搜尋記錄？",
            `「${item.query}」的搜尋次數也會一併移除，無法復原。`,
            "刪除記錄",
          ))
        )
          return;
        await api("/api/portal/searches/" + id, "DELETE");
        break;
      case "search-again":
        await external("/api/portal/search", {
          engine: item.engine,
          query: item.query,
        });
        break;
      case "revoke":
        if (
          !(await confirmAction(
            "撤銷分享連結？",
            "持有原連結的人將無法使用。你可以另建新連結，但無法恢復這個網址。",
            "撤銷連結",
          ))
        )
          return;
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
        announce("已下載收藏備份");
        return;
      case "rss": {
        const r = await fetch("/api/portal/feed", {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!r.ok) throw Error("RSS 匯出失敗");
        download(await r.blob(), "myzilla-bookmarks.rss");
        announce("已下載私人 RSS");
        return;
      }
    }
    await load();
  });
});
root.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (!["scope", "sort", "audience", "online-opt"].includes(target.id)) return;
  void run(async () => {
    if (target.id === "scope") scope = target.value;
    else if (target.id === "sort") sort = target.value;
    else if (target.id === "audience") audience = target.value;
    else if (target.id === "online-opt") {
      await api("/api/portal/preferences", "PUT", {
        online: (target as unknown as HTMLInputElement).checked,
      });
    } else return;
    offset = 0;
    state();
    await load();
  });
});
const restore = async () => {
  if (restoring || location.href === renderedURL) return;
  restoring = true;
  if (!(await discardChanges(root))) {
    history.replaceState(null, "", renderedURL);
    restoring = false;
    return;
  }
  clearDirty(root);
  params = new URL(location.href).searchParams;
  scope = params.get("scope") ?? "all";
  query = params.get("q") ?? "";
  sort = params.get("sort") ?? "recent";
  offset = Math.max(0, Number(params.get("offset")) || 0);
  audience = params.get("audience") === "friends" ? "friends" : "mine";
  kind = Object.hasOwn(labels, location.hash.slice(1))
    ? location.hash.slice(1)
    : "bookmark";
  await run(load, false);
  restoring = false;
};
addEventListener("popstate", restore);
addEventListener("hashchange", restore);
render();
void run(load, false);
