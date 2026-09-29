import "./icons.css";
// Local SVGs: no icon font, external request, or browsing data sent to an image service.
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  inbox: '<path d="M4 4h16l2 12v4H2v-4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  article: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  movie:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  heart:
    '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 4 12 8 15 4-3 13-10 8-15Z"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  link: '<path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 9l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1) scale(.92)"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M3 3v18h18M7 16v-5M12 16V7M17 16V4"/>',
  upload: '<path d="M4 15v6h16v-6M12 16V3m-5 5 5-5 5 5"/>',
  logout: '<path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  edit: '<path d="m15 4 5 5M3 21l5-1L21 7l-5-5L3 15Z"/>',
  share:
    '<circle cx="18" cy="4" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="20" r="3"/><path d="m8 10 7-4M8 14l7 4"/>',
  up: '<path d="M12 21V3m-7 7 7-7 7 7"/>',
  down: '<path d="M12 3v18m-7-7 7 7 7-7"/>',
  arrow: '<path d="M3 12h18m-7-7 7 7-7 7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  archive: '<path d="M3 3h18v5H3ZM5 8v13h14V8M9 12h6"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  undo: '<path d="M3 10h11a7 7 0 0 1 0 14" transform="translate(0 -4)"/><path d="m7 2-4 4 4 4"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  intersect: '<circle cx="9" cy="12" r="7"/><circle cx="15" cy="12" r="7"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01"/>',
} as const;
export type IconName = keyof typeof paths;
export function icon(name: IconName, extra = "") {
  return `<svg class="mz-icon ${extra}" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
const labels: [RegExp, IconName][] = [
  [/^(我的入口|今日入口)$/, "home"],
  [/^(主題選集|我的與共同編輯|所有選集)/, "layers"],
  [/^(待整理|加入待整理|回到待整理)/, "inbox"],
  [/^(瀏覽回顧|瀏覽記錄|瀏覽歷史|歷史|回顧|長期線索)/, "clock"],
  [/^(洞察|興趣|我的探索|挑選相關|探索朋友)/, "compass"],
  [/^(我的網址|放進|留到|先保留)/, "bookmark"],
  [/^我的網摘/, "article"],
  [/^我的電影/, "movie"],
  [/^我的心情/, "heart"],
  [/^(帳號與朋友|朋友|線上使用者|一起整理|加入朋友|允許共同)/, "users"],
  [/^(匯入與設定|編輯介紹|個人設定|帳號設定)/, "settings"],
  [/^(匯入|下載|擴充功能|立即同步)/, "upload"],
  [/^(快速搜尋|搜尋|再次搜尋|找回)/, "search"],
  [/^(短網址|複製|開啟網址)/, "link"],
  [/^(使用說明|如何|說明)/, "help"],
  [/^登出$/, "logout"],
  [/^(新增|加入連結|建立主題|建立私人)/, "plus"],
  [/^(整理這個|挑選開啟|將已選)/, "inbox"],
  [/^(編輯|寫推薦理由)/, "edit"],
  [/^(預覽|查看依據)/, "eye"],
  [/^(建立分享|分享|已發布)/, "share"],
  [/^(封存|已封存)/, "archive"],
  [/^(復原|恢復|重試|重新載入)/, "undo"],
  [/^(取消|關閉|略過|退出)/, "close"],
  [/^(撤銷|刪除|移除|移出)/, "trash"],
  [/^(儲存|接受|確認|整理已選)/, "check"],
  [/^上移$/, "up"],
  [/^下移$/, "down"],
];
export function installIcons(root: HTMLElement) {
  let scheduled = false;
  const decorate = () => {
    scheduled = false;
    for (const node of root.querySelectorAll<HTMLElement>("nav a,button,h2")) {
      if (node.querySelector("svg") || node.classList.contains("site-icon"))
        continue;
      const text = node.textContent?.trim() ?? "";
      const name = labels.find(([pattern]) => pattern.test(text))?.[1];
      if (name) node.insertAdjacentHTML("afterbegin", icon(name));
    }
  };
  const observer = new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(decorate);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  decorate();
  return () => observer.disconnect();
}
