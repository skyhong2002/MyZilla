import "./style.css";
import "./classic.css";
import "./community.css";
import {
  installUX,
  pendingUI,
  errorMessage,
  announce,
  confirmAction,
  clearDirty,
  copyControl,
  focusHeading,
  reauthenticate,
  discardChanges,
} from "./ux";
const root = document.getElementById("community")!;
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
const getToken = () => sessionStorage.getItem("myzilla-token") ?? "";
const saveToken = (token: string) =>
  sessionStorage.setItem("myzilla-token", token);
let data: any;
let googleEnabled = false;
let siteLimit = 50;
let siteQuery = "";
let output = "";
let pending = false;
let renderedURL = location.href,
  restoring = false;
installUX(root);
const views = {
  account: "帳號",
  interests: "興趣分析",
  friends: "朋友與配對",
  shares: "分享",
};
function view() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(views, hash) ? hash : "account";
}
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/api/")) {
      sessionStorage.removeItem("myzilla-token");
      if (data?.me?.id) {
        const ok = await reauthenticate(data.me.id);
        throw Error(
          ok
            ? "登入已恢復，請重新送出剛才的操作。"
            : "尚未登入，輸入仍保留。再次送出即可重新登入。",
        );
      }
    }
    throw new Error(result.error ?? `HTTP ${response.status}`);
  }
  return result;
}
const identity = `<label>帳號（小寫英數、底線或連字號）<input name="handle" required minlength="3" maxlength="32" pattern="[a-z0-9][a-z0-9_-]{2,31}" autocomplete="username"></label><label>顯示名稱<input name="name" required maxlength="80" autocomplete="nickname"></label><label>密碼（至少 12 字元）<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label>`;
function categories(profile: any) {
  return `<div class="category-bars">${profile.categories.map((row: any) => `<div><div class="section-heading"><span>${esc(row.label)}</span><span>${row.percent}% · ${row.visits.toLocaleString()} 次</span></div><progress value="${row.percent}" max="100" aria-label="${esc(row.label)}"></progress></div>`).join("")}</div>`;
}
function render() {
  renderedURL = location.href;
  document.title = `${data ? views[view() as keyof typeof views] : "登入"} · MyZilla`;
  root.innerHTML = `<a class="skip-link" href="#community-main">跳到主要內容</a><header class="site-header"><a class="brand" href="/"><img class="brand-logo" src="./myzilla-mark.svg" width="48" height="36" alt=""><strong>MyZilla</strong></a><nav class="site-nav" aria-label="主要導覽"><a href="/">我的入口</a><a href="/dashboard.html">瀏覽回顧</a><a href="/dashboard.html#settings">匯入與設定</a><a href="/community.html" aria-current="page">帳號與朋友</a><a href="/help.html">使用說明</a>${data ? '<button data-action="logout">登出</button>' : ""}</nav></header><main id="community-main" tabindex="-1" class="site-main community-main"><section class="profile"><div><div class="eyebrow">YOUR SPACE, YOUR CONNECTIONS</div><h1>${data ? `${esc(data.me.name)} 的空間` : "你的瀏覽，也能成為交流的起點"}</h1><p>私人歷史留給自己；選擇要分享的興趣摘要。</p></div></section><p id="community-message" role="status" aria-live="polite">${esc(output)}</p>${copyControl(output)}${data ? loggedIn() : login()}<footer>MyZilla · 原始瀏覽歷史僅供本人存取</footer></main>`;
  renderSites();
}
function login() {
  return `<div class="community-grid"><section><h2>登入帳號</h2>${googleEnabled ? '<p><a class="google-login" href="/auth/google/start">使用 Google 帳號登入</a></p>' : ""}<form data-form="login"><label>帳號<input name="handle" required autocomplete="username"></label><label>密碼<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"></label><button class="primary">登入</button></form></section><section><h2>已有原始存取金鑰？</h2><p>這是部署時提供的存取密碼，可開啟既有私人空間。之後可建立帳號或連結 Google，保留全部紀錄。 <a href="/help.html#login">第一次登入說明</a></p><form data-form="legacy"><label>存取金鑰<input name="token" type="password" required minlength="32" autocomplete="off"></label><button>使用金鑰開啟</button></form></section></div><details class="community-section"><summary>收到加入邀請？建立帳號</summary><form data-form="register"><label>邀請碼<input name="invitation" required minlength="32" autocomplete="off"></label>${identity}<button class="primary">建立私人帳號</button></form></details>`;
}
function loggedIn() {
  return `<nav class="page-nav" aria-label="帳號與社交導覽">${Object.entries(
    views,
  )
    .map(
      ([id, label]) =>
        `<a href="#${id}" ${view() === id ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join(
      "",
    )}</nav><section class="community-section">${view() === "account" ? account() : view() === "interests" ? interests() : view() === "friends" ? friends() : shares()}</section>`;
}
function account() {
  const me = data.me;
  return `${!me.claimed && me.id === "owner" && me.credential === "legacy" ? `<section><h2>建立擁有者帳號</h2><p>現有 ${data.interests.total.toLocaleString()} 筆造訪會留在此帳號，不需重新匯入。</p><form data-form="claim">${identity}<button class="primary">建立帳號並登入</button></form></section>` : `<p>帳號：<strong>@${esc(me.handle)}</strong></p>`}
  ${googleEnabled ? `<section><h2>Google 登入</h2>${me.googleEmail ? `<p>已連結：${esc(me.googleEmail)}</p><p>下次可直接使用 Google 登入此私人空間。</p>` : '<p>連結後可用 Google 登入，現有收藏與瀏覽紀錄都會保留。<a href="/help.html#login">登入說明</a></p><button data-action="google-link">連結 Google 帳號</button>'}</section>` : ""}
  <section><h2>個人設定</h2><form data-form="profile"><label>顯示名稱<input name="name" value="${esc(me.name)}" required maxlength="80"></label><label class="check-label"><input type="checkbox" name="matching" ${me.matching ? "checked" : ""}>讓已接受的朋友比較我的興趣分類摘要</label><p class="note">雙方都開啟才顯示配對。朋友可見名稱、分類比例與造訪總數；看不到網址、標題、裝置或個別時間。關閉後立即停止比較。</p><button>儲存設定</button></form></section>
  <section><h2>瀏覽器同步金鑰</h2><p>用於擴充功能與原生匯入工具，有效一年，可同步及讀取此帳號歷史；不能管理朋友或分享。更換會使上一把同步金鑰失效。</p><div class="actions"><button data-action="device-token">建立／更換同步金鑰</button><button data-action="revoke-device">撤銷同步金鑰</button></div><p class="note">原始擁有者金鑰保持相容，請勿傳給朋友。朋友須使用自己的帳號與同步金鑰。</p></section>
  ${me.id === "owner" ? '<section><h2>邀請加入本站</h2><p>一次性邀請碼，有效七天。新帳號從空白私人空間開始。</p><button data-action="invite">產生邀請碼</button></section>' : ""}
  ${me.claimed ? '<details><summary>變更密碼</summary><form data-form="password"><label>目前密碼<input name="current" type="password" required minlength="12" maxlength="128" autocomplete="current-password"></label><label>新密碼<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button>變更密碼並登出其他工作階段</button></form></details>' : ""}`;
}
function interests() {
  const profile = data.interests;
  return `<h2>供朋友比較的興趣摘要</h2><p>想看具體主題與探索路徑？前往<a href="/dashboard.html#insights">私人洞察</a>。這裡管理朋友配對使用的網站分類。</p><p>全部 ${profile.total.toLocaleString()} 次造訪；其中 ${profile.classified.toLocaleString()} 次已分類。依網站規則及你的修正彙整，不使用外部 AI、不推論人格；綜合型網站可能包含多種內容。</p>${categories(profile)}<h3>校正網站分類</h3><p class="note">以下網站僅你可見。找不到合適分類可以保留「未分類」；配對不計未分類。</p><label>搜尋網站<input id="site-search" type="search" value="${esc(siteQuery)}" placeholder="輸入網域"></label><div id="category-sites"></div><button data-action="more-sites">顯示更多網站</button>`;
}
function renderSites() {
  const container = document.getElementById("category-sites");
  if (!container || !data) return;
  const sites = data.interests.sites.filter((row: any) =>
    row.domain.toLowerCase().includes(siteQuery.toLowerCase()),
  );
  container.innerHTML = `<p>${sites.length.toLocaleString()} 個網站，顯示前 ${Math.min(siteLimit, sites.length)}</p>${sites
    .slice(0, siteLimit)
    .map(
      (row: any) =>
        `<div class="source-row"><div><strong>${esc(row.domain)}</strong><span>${row.visits.toLocaleString()} 次${row.customized ? " · 自訂分類" : ""}</span></div><div class="actions"><select data-domain="${esc(row.domain)}" aria-label="${esc(row.domain)} 的分類">${data.interests.categories.map((category: any) => `<option value="${category.id}" ${category.id === row.category ? "selected" : ""}>${esc(category.label)}</option>`).join("")}</select>${row.customized ? `<button data-action="reset-category" data-domain="${esc(row.domain)}">恢復規則</button>` : ""}</div></div>`,
    )
    .join("")}`;
  const button = root.querySelector<HTMLButtonElement>(
    '[data-action="more-sites"]',
  );
  if (button) button.hidden = sites.length <= siteLimit;
}
function friends() {
  return `<h2>朋友</h2><form data-form="friend"><label>對方帳號<input name="handle" required placeholder="例如 sky" maxlength="32"></label><button class="primary">送出朋友邀請</button></form><div>${data.friends.friends.length ? data.friends.friends.map((friend: any) => `<div class="source-row"><div><strong>${esc(friend.name)} · @${esc(friend.handle)}</strong><span>${friend.status === "accepted" ? "已是朋友" : friend.direction === "incoming" ? "邀請你成為朋友" : "等待對方接受"}</span></div><div class="actions">${friend.status === "pending" && friend.direction === "incoming" ? `<button data-action="accept" data-id="${friend.id}">接受</button>` : ""}<button data-action="remove" data-id="${friend.id}">${friend.status === "accepted" ? "移除朋友" : friend.direction === "incoming" ? "婉拒" : "取消邀請"}</button></div></div>`).join("") : '<p class="empty">還沒有朋友邀請。可請朋友提供帳號，或由擁有者邀請加入本站。</p>'}</div><section><h2>興趣配對</h2><p>比較你們常看的網站類別與比例；分數越高，分布越相近。未分類網站不計入。</p>${!data.matches.enabled ? '<p>尚未開啟比較。到<a href="#account">帳號設定</a>選擇是否開放。</p>' : data.matches.matches.length ? data.matches.matches.map((match: any) => `<article class="match"><h3>${esc(match.name)} · ${match.score === null ? "尚無足夠分類資料" : `${match.score}% 分布相似度`}</h3><p>共同分類：${esc(match.shared.join("、") || "目前沒有")}</p><details><summary>查看對方已開放的興趣摘要</summary>${categories(match.profile)}</details></article>`).join("") : "<p>接受朋友邀請，且雙方都開啟比較後，才會出現在這裡。</p>"}</section>`;
}
function shares() {
  return `<h2>分享我的興趣摘要</h2><p>建立連結前，先在<a href="#interests">興趣分析</a>確認內容。分享包含顯示名稱、全部造訪總數、分類次數與比例，沒有網站清單、原始網址或標題。</p><p>持有連結的人都能閱讀這份固定快照；連結不列入公開目錄，可隨時撤銷。<a href="/help.html#sharing">分享範圍說明</a></p><form data-form="share"><label>有效期間<select name="days"><option value="1">1 天</option><option value="7" selected>7 天</option><option value="30">30 天</option></select></label><button class="primary">建立分享連結</button></form><h3>有效分享</h3>${data.shares.shares.length ? data.shares.shares.map((share: any) => `<div class="source-row"><span>到期：${esc(new Date(share.expires).toLocaleString("zh-TW"))}</span><button data-action="revoke-share" data-id="${share.id}">撤銷分享</button></div>`).join("") : "<p>目前沒有有效的分享連結。</p>"}`;
}
async function load() {
  if (!getToken()) {
    data = undefined;
    render();
    return;
  }
  const me = await api("/api/community/me");
  const [interests, friends, matches, shares] = await Promise.all(
    ["interests", "friends", "matches", "shares"].map((path) =>
      api(`/api/community/${path}`),
    ),
  );
  data = { me, interests, friends, matches, shares };
  render();
}
async function run(job: () => Promise<void>) {
  if (pending) return;
  pending = true;
  const finish = pendingUI(root);
  try {
    await job();
  } catch (error) {
    output = errorMessage(error);
    announce(output, true);
    const el = document.getElementById("community-message");
    if (el) el.textContent = output;
  } finally {
    pending = false;
    finish();
  }
}
root.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const input = Object.fromEntries(new FormData(form)) as Record<
    string,
    string
  >;
  void run(async () => {
    output = "";
    const type = form.dataset.form;
    if (type === "legacy") saveToken(input.token.trim());
    else if (type === "login" || type === "register")
      saveToken((await api(`/auth/${type}`, "POST", input)).token);
    else if (type === "claim" || type === "password")
      saveToken((await api(`/api/community/${type}`, "POST", input)).token);
    else if (type === "profile") {
      await api("/api/community/profile", "PUT", {
        name: input.name,
        matching: input.matching === "on",
      });
      output = "個人設定已儲存";
    } else if (type === "friend") {
      await api("/api/community/friends", "POST", input);
      output = "朋友邀請已送出";
    } else if (type === "share") {
      const result = await api("/api/community/shares", "POST", {
        days: Number(input.days),
      });
      output = `分享連結（請複製保存）：${location.origin}${result.path}`;
    }
    clearDirty(root);
    await load();
    focusHeading(root);
    if (output && !/：https?:|金鑰|邀請碼/.test(output)) announce(output);
  });
});
root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-action]",
  );
  if (!button) return;
  void run(async () => {
    if (!(await discardChanges(root))) return;
    clearDirty(root);
    output = "";
    const action = button.dataset.action,
      id = encodeURIComponent(button.dataset.id ?? "");
    if (action === "google-link") {
      const { url } = await api("/api/community/google/link", "POST");
      location.assign(url);
      return;
    } else if (action === "logout") {
      await api("/api/community/logout", "POST");
      sessionStorage.removeItem("myzilla-token");
      data = undefined;
    } else if (action === "invite") {
      output = `一次性邀請碼（七天內有效）：${(await api("/api/community/invitations", "POST")).invitation}`;
    } else if (action === "device-token") {
      if (
        !(await confirmAction(
          "建立或更換同步金鑰？",
          "原有同步金鑰會立即失效。更換後，請在每個瀏覽器設定檔更新金鑰，才會繼續同步。",
          "建立新金鑰",
        ))
      )
        return;
      output = `同步金鑰（只顯示這一次，請保存）：${(await api("/api/community/device-token", "POST")).token}`;
    } else if (action === "revoke-device") {
      if (
        !(await confirmAction(
          "撤銷同步金鑰？",
          "使用這把金鑰的擴充功能與匯入工具將停止同步，既有歷史不會刪除。",
          "撤銷金鑰",
        ))
      )
        return;
      await api("/api/community/device-token", "DELETE");
      output = "同步金鑰已撤銷";
    } else if (action === "accept")
      await api(`/api/community/friends/${id}/accept`, "POST");
    else if (action === "remove") {
      const friend = data.friends.friends.find(
        (f: any) => f.id === button.dataset.id,
      );
      if (
        !(await confirmAction(
          `${button.textContent}？`,
          `${friend?.name ?? "對方"} 將不再能透過這段朋友關係查看你分享的收藏或興趣。重新加入需要再次接受邀請。`,
          button.textContent ?? "移除",
        ))
      )
        return;
      await api(`/api/community/friends/${id}`, "DELETE");
      output = "朋友關係已更新";
    } else if (action === "revoke-share") {
      if (
        !(await confirmAction(
          "撤銷摘要分享？",
          "原連結會立即失效，無法恢復。你仍可建立新的分享連結。",
          "撤銷分享",
        ))
      )
        return;
      await api(`/api/community/shares/${id}`, "DELETE");
      output = "分享已撤銷";
    } else if (action === "reset-category")
      await api("/api/community/categories", "PUT", {
        domain: button.dataset.domain,
        category: null,
      });
    else if (action === "more-sites") {
      siteLimit += 50;
      renderSites();
      return;
    }
    await load();
  });
});
root.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  if (!select.dataset.domain) return;
  void run(async () => {
    await api("/api/community/categories", "PUT", {
      domain: select.dataset.domain,
      category: select.value,
    });
    output = "分類已更新";
    await load();
  });
});
root.addEventListener("input", (event) => {
  if ((event.target as HTMLElement).id === "site-search") {
    siteQuery = (event.target as HTMLInputElement).value;
    siteLimit = 50;
    renderSites();
  }
});
addEventListener("hashchange", async () => {
  if (restoring || location.href === renderedURL) return;
  restoring = true;
  if (!(await discardChanges(root))) {
    history.replaceState(null, "", renderedURL);
    restoring = false;
    return;
  }
  clearDirty(root);
  output = "";
  render();
  focusHeading(root);
  restoring = false;
});
render();
void run(async () => {
  const params = new URL(location.href).searchParams;
  const complete = params.has("google_complete");
  const error = params.get("google_error");
  if (complete || error)
    history.replaceState(null, "", "/community.html" + location.hash);
  googleEnabled = (
    await api("/auth/google/config").catch(() => ({ enabled: false }))
  ).enabled;
  if (complete) {
    const result = await api("/auth/google/session", "POST");
    saveToken(result.token);
    output = "已使用 Google 登入";
  } else if (error) {
    const messages: Record<string, string> = {
      unlinked:
        "此 Google 帳號尚未連結。請先使用原有帳號或存取金鑰登入，再於帳號設定連結 Google。新使用者請先使用邀請碼建立帳號。",
      linked: "此 Google 帳號或私人空間已經連結其他帳號，未變更連結。",
      cancelled: "已取消 Google 登入。",
      expired: "原登入已過期，請重新登入後連結 Google。",
      state: "登入驗證已失效，請在同一個瀏覽器重新開始。",
    };
    output = messages[error] ?? "Google 登入未完成，請重新嘗試。";
  }
  await load();
});
