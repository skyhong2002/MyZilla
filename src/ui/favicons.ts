import "./favicons.css";
let credentials = () => ({
  token: sessionStorage.getItem("myzilla-token") ?? "",
  server: "",
});
export function configureFavicons(provider: typeof credentials) {
  credentials = provider;
}
export function favicon(url: string, large = false) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    const host = parsed.hostname;
    if (!/^[a-z0-9.\-]+$/i.test(host)) return "";
    return `<span class="link-favicon${large ? " favicon-large" : ""}" data-favicon-host="${host}" aria-hidden="true">${host
      .replace(/^www\./, "")
      .charAt(0)
      .toUpperCase()}</span>`;
  } catch {
    return "";
  }
}
const cache = new Map<string, Promise<string | null>>();
const queue: (() => Promise<void>)[] = [];
let active = 0;
function drain() {
  while (active < 4 && queue.length) {
    active++;
    void queue.shift()!().finally(() => {
      active--;
      drain();
    });
  }
}
function load(host: string) {
  const { token, server } = credentials();
  if (!token) return Promise.resolve(null);
  const key = server + ":" + host;
  if (!cache.has(key)) {
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(
      key,
      new Promise((resolve) => {
        queue.push(async () => {
          try {
            const response = await fetch(
              `${server}/api/favicon?host=${encodeURIComponent(host)}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                credentials: "omit",
                redirect: "error",
                signal: AbortSignal.timeout(35000),
              },
            );
            const data = response.ok ? await response.json() : null;
            resolve(
              /^data:image\/(?:png|x-icon|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(
                data?.icon ?? "",
              )
                ? data.icon
                : null,
            );
          } catch {
            resolve(null);
          }
        });
        drain();
      }),
    );
  }
  return cache.get(key)!;
}
export function installFavicons(root: HTMLElement) {
  const observed = new WeakSet<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const node = entry.target as HTMLElement;
        void load(node.dataset.faviconHost!).then((src) => {
          if (!src || !node.isConnected) return;
          const img = new Image();
          img.alt = "";
          img.width = 20;
          img.height = 20;
          img.dataset.favicon = "true";
          img.onload = () => node.classList.add("favicon-loaded");
          img.onerror = () => {
            img.remove();
            node.classList.remove("favicon-loaded");
          };
          img.src = src;
          node.append(img);
        });
      }
    },
    { rootMargin: "150px" },
  );
  const scan = () => {
    for (const link of root.querySelectorAll<HTMLAnchorElement>(
      'a[href^="https://"], a[href^="http://"]',
    )) {
      if (link.dataset.faviconChecked) continue;
      link.dataset.faviconChecked = "true";
      // Cards already place the site's icon next to its domain/title.
      if (
        link.querySelector("img, .link-favicon") ||
        link.closest(".resume-card, .item")?.querySelector(".link-favicon")
      )
        continue;
      if (link.origin === location.origin) continue;
      const existing = link.querySelector(".site-icon");
      const markup = favicon(link.href, !!existing);
      if (existing && markup) existing.outerHTML = markup;
      else link.insertAdjacentHTML("afterbegin", markup);
    }
    for (const node of root.querySelectorAll<HTMLElement>(
      "[data-favicon-host]",
    )) {
      if (observed.has(node)) continue;
      observed.add(node);
      observer.observe(node);
    }
  };
  let pending = false;
  const mutations = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      scan();
    });
  });
  mutations.observe(root, { childList: true, subtree: true });
  scan();
  return () => {
    observer.disconnect();
    mutations.disconnect();
  };
}
