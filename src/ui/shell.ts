type Section =
  "home" | "collections" | "dashboard" | "settings" | "community" | "help";
const publicItems = new Set<Section>(["home", "help"]);
export function siteHeader(
  active: Section,
  account = "",
  dashboard = false,
  extension = false,
  signedOut = false,
) {
  const items: [Section, string, string][] = [
    ["home", "我的入口", "/#home"],
    ["collections", "主題選集", "/#collections"],
    ["dashboard", "瀏覽回顧", "/dashboard.html"],
    ["settings", "匯入與設定", "/dashboard.html#settings"],
    ["community", "帳號與朋友", "/community.html"],
    ["help", "使用說明", "/help.html"],
  ];
  // Signed-out visitors only see public destinations; the dashboard toggles
  // this class when a key unlocks it in place.
  return `<div class="app-header${signedOut ? " signed-out" : ""}"><div class="app-header-inner"><header class="site-header app-brand-row"><a class="app-wordmark" href="${extension ? "#overview" : "/"}"><img src="./myzilla-mark.svg" width="40" height="30" alt=""><strong>MyZilla</strong></a></header><nav id="primary-nav" class="site-nav top-nav app-nav" aria-label="主要導覽">${items
    .filter(([id]) => !extension || id === "dashboard" || id === "settings")
    .map(([id, label, href]) => {
      const local = dashboard && (id === "dashboard" || id === "settings");
      const view = id === "settings" ? "settings" : "overview";
      return `<a href="${local ? "#" + view : href}" ${local ? `data-view="${view}" data-main-nav="${id}"` : ""} ${publicItems.has(id) ? "" : "data-private-nav"} ${active === id ? 'aria-current="page"' : ""}>${label}</a>`;
    })
    .join("")}</nav><div class="app-account"><button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" data-nav-toggle>選單</button>${account}</div></div></div>`;
}
