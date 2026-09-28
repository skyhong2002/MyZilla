import { z } from "zod";
import { webUrl } from "../shared/model";
export const scopes = {
  personal: "個人",
  home: "我的家庭",
  friends: "我的朋友",
  study: "我的研究",
  work: "我的工作",
} as const;
export const engines = {
  books: {
    label: "博客來",
    base: "https://search.books.com.tw/search/query/key/",
    parameter: "key",
  },
  google_tw: {
    label: "Google 台灣",
    base: "https://www.google.com.tw/search",
    parameter: "q",
  },
  gamer: {
    label: "巴哈姆特",
    base: "https://search.gamer.com.tw/",
    parameter: "q",
  },
  dictionary: {
    label: "劍橋英漢字典",
    base: "https://dictionary.cambridge.org/search/direct/?datasetsearch=english-chinese-traditional",
    parameter: "q",
  },
  mysql: {
    label: "MySQL 文件",
    base: "https://dev.mysql.com/search/",
    parameter: "q",
  },
  google: {
    label: "Google",
    base: "https://www.google.com/search",
    parameter: "q",
  },
  scholar: {
    label: "Google Scholar",
    base: "https://scholar.google.com/scholar",
    parameter: "q",
  },
  imdb: {
    label: "IMDb 電影",
    base: "https://www.imdb.com/find/",
    parameter: "q",
  },
  wikipedia: {
    label: "維基百科",
    base: "https://zh.wikipedia.org/w/index.php",
    parameter: "search",
  },
  yahoo: {
    label: "Yahoo 奇摩",
    base: "https://tw.search.yahoo.com/search",
    parameter: "p",
  },
  php: {
    label: "PHP 文件",
    base: "https://www.php.net/manual-lookup.php",
    parameter: "pattern",
  },
  ebay: {
    label: "eBay",
    base: "https://www.ebay.com/sch/i.html",
    parameter: "_nkw",
  },
  amazon: { label: "Amazon", base: "https://www.amazon.com/s", parameter: "k" },
} as const;
export function searchUrl(engine: keyof typeof engines, query: string) {
  if (engine === "books")
    return `https://search.books.com.tw/search/query/key/${encodeURIComponent(query)}/cat/all`;
  const item = engines[engine];
  const url = new URL(item.base);
  url.searchParams.set(item.parameter, query);
  return url.href;
}
export const itemSchema = z
  .object({
    kind: z.enum(["bookmark", "article", "movie", "mood"]),
    title: z.string().trim().min(1).max(500),
    url: z.string().max(8000).default(""),
    scope: z
      .enum(["personal", "home", "friends", "study", "work"])
      .default("personal"),
    visibility: z.enum(["private", "friends"]).default("private"),
    tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
    notes: z.string().max(10000).default(""),
    rating: z.number().int().min(0).max(10).default(0),
    watched: z.number().int().min(0).max(100000).default(0),
    wishlist: z.boolean().default(false),
    collection: z.string().max(500).default(""),
    mood: z.enum(["happy", "calm", "busy", "tired", "sad"]).default("calm"),
  })
  .refine(
    (value) =>
      value.url
        ? Boolean(webUrl(value.url))
        : !["bookmark", "article"].includes(value.kind),
    { message: "網址需為不含帳密的 HTTP/HTTPS 網址", path: ["url"] },
  );
export type PortalItem = z.infer<typeof itemSchema>;
export const xml = (text: string) =>
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[ch]!,
  );
