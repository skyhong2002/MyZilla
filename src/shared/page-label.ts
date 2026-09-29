import { webUrl } from "./model";

/** Display-only clues; never rewrite imported titles or infer page contents. */
export function pageLabel(page: { url: string; title?: string }) {
  const raw = (page.title ?? "").trim();
  const safe = webUrl(page.url);
  if (!safe)
    return {
      title: raw || page.url || "內部頁面",
      detail: "",
      specific: false,
      site: "內部頁面",
    };
  const url = new URL(safe),
    host = url.hostname.replace(/^www\./, "");
  const facebook = /(^|\.)facebook\.com$/.test(host);
  const site = facebook
    ? "Facebook"
    : /(^|\.)linkedin\.com$/.test(host)
      ? "LinkedIn"
      : /(^|\.)instagram\.com$/.test(host)
        ? "Instagram"
        : host;
  const normalized = raw.replace(/^\(\d+\)\s*/, "").trim();
  const generic =
    !normalized ||
    [
      site,
      host,
      url.hostname,
      "Facebook – 登入或註冊",
      "Facebook - Log In or Sign Up",
    ].some((v) => v.toLowerCase() === normalized.toLowerCase()) ||
    normalized === page.url ||
    normalized === safe ||
    (facebook && /^(?:.+ messaged|.+傳送訊息|.+傳送了訊息)/i.test(normalized));
  if (!generic) return { title: raw, detail: "", specific: true, site };
  let kind = "頁面";
  const path = url.pathname;
  if (facebook) {
    if (host === "l.facebook.com" || host === "lm.facebook.com")
      kind = "外部連結轉址";
    else if (/^\/photo(?:\.php|\/|$)/.test(path)) kind = "相片";
    else if (/^\/reels?(?:\/|$)/.test(path)) kind = "短片（Reel）";
    else if (/^\/watch(?:\/|$)/.test(path) || /\/videos\//.test(path))
      kind = "影片";
    else if (/\/posts\//.test(path) || /^\/(?:story|permalink)\.php/.test(path))
      kind = "貼文";
    else if (/^\/groups(?:\/|$)/.test(path)) kind = "社團頁面";
    else if (/^\/messages(?:\/|$)/.test(path)) kind = "訊息頁面";
    else if (/^\/profile\.php(?:$|\/)/.test(path) || /^\/people\//.test(path))
      kind = "個人／專頁";
    else if (/^\/(?:home\.php)?$/.test(path)) kind = "動態消息";
  } else if (path === "/") kind = "首頁";
  let route = path;
  try {
    route = decodeURIComponent(path);
  } catch {}
  // Only resource identifiers, never auth/tracking parameters or search terms.
  const ids = ["fbid", "story_fbid", "id", "v"].flatMap((key) => {
    const value = url.searchParams.get(key);
    return value && /^[\w.-]{1,160}$/.test(value) ? [`${key}=${value}`] : [];
  });
  const clue = [route !== "/" ? route : "", ids.join(" · ")]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 260);
  return {
    title: `${site} · ${kind}`,
    detail: `${clue ? clue + " · " : ""}原始紀錄未提供內容標題`,
    specific: false,
    site,
  };
}

export function recentPages<
  T extends { url: string; title?: string; visitedAt: number },
>(visits: T[], limit = 6) {
  const pages: T[] = [],
    seen = new Set<string>();
  const grouped = new Map<
    string,
    { site: string; count: number; items: (T & { count: number })[] }
  >();
  for (const visit of visits) {
    if (!webUrl(visit.url)) continue;
    const label = pageLabel(visit);
    if (!label.specific) {
      let group = grouped.get(label.site);
      if (!group) {
        group = { site: label.site, count: 0, items: [] };
        grouped.set(label.site, group);
      }
      group.count++;
      const item = group.items.find((v) => v.url === visit.url);
      if (item) item.count++;
      else group.items.push({ ...visit, count: 1 });
    } else if (!seen.has(visit.url)) {
      seen.add(visit.url);
      if (pages.length < limit) pages.push(visit);
    }
  }
  return { pages, groups: [...grouped.values()] };
}
