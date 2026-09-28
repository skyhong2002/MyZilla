import { createHash } from "node:crypto";
import { webUrl } from "../shared/model";
export type Row = {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  deviceId: string;
  source: { browser: string; profile: string; device: string };
};
export type Feedback = {
  topic: string;
  label: string;
  mode: "interest" | "work" | "exclude";
};
const DAY = 86400000;
const stop = new Set(
  "google facebook instagram youtube twitter reddit microsoft apple untitled home login signin account dashboard search new tab docs document www com org net html http https index page loading settings official website online free 中文 官方 首頁 登入 搜尋 網站 網頁 文件 頁面 更多 最新 分享 使用 我的 我們 你的 可以 如何 什麼 一個 這個 以及 已經 目前 所有 服務 設定 管理 系統 工作 新增 編輯 儲存 刪除 確認 返回 瀏覽 開啟 專案 內容 資料 訊息 通知 個人 帳號 用戶 使用者 the and for with from this that your you are not has have into about how what why all get can new best will using learn".split(
    " ",
  ),
);
for (const word of "字幕 中文字幕 文字幕 sign 討論 資訊 國立 臺灣 社團 線上 免費 郵件 收件 收件匣 雲端 硬碟 簡報 試算表 收件人 封 存檔 快速 簡單 教學 推薦 問題 方法 功能 下載 更新 影片 文章 連結 線上版 公司 官網 活動 產品 用 上 下 中 中心 台灣 台湾 中國 中国 inbox gmail drive sheets slides forms office outlook calendar microsoft bing yahoo chrome brave safari firefox zen user users code app web site files file view edit open tool tools software video videos image images news today also more only just here there when where which than then other some any its been does would should may create update download results".split(
  " ",
))
  stop.add(word);
const rules: [string, RegExp][] = [
  ["口琴與演奏", /口琴|\bharmonica\b/iu],
  ["陽明交通大學", /陽明交通大學|陽明交大|\bnycu\b|yang ming chiao tung/iu],
  ["身分驗證與 OAuth", /\boauth\b|\bopenid\b|\bpasskey\b|身分驗證|身份驗證/iu],
  [
    "Cloudflare 與網站部署",
    /cloudflare|\bnginx\b|\bdocker\b|\bkubernetes\b|反向代理|網站部署/iu,
  ],
  [
    "AI 模型與代理",
    /\bllm\b|\bchatgpt\b|\bgemini\b|\bclaude\b|\bcodex\b|\bopenai\b|語言模型|人工智慧|生成式|\bagent[ s]\b/iu,
  ],
  [
    "程式開發與版本控制",
    /\bgithub\b|\bgitlab\b|\btypescript\b|\bpython\b|\brust\b|\bjavascript\b|程式設計|版本控制/iu,
  ],
  [
    "資料庫與資料整理",
    /\bsqlite\b|\bpostgres\b|\bsql\b|\bdataset\b|資料庫|資料清理|資料整理|資料視覺化/iu,
  ],
  [
    "地方歷史與文化",
    /地方史|地方歷史|地方文化|文化資產|口述歷史|古地圖|地方創生/iu,
  ],
  [
    "設計與視覺溝通",
    /\bfigma\b|\bcanva\b|字體|平面設計|介面設計|視覺設計|設計系統/iu,
  ],
  [
    "學習與教育研究",
    /教學設計|教育研究|課程設計|學習科學|\bpedagogy\b|\bcurriculum\b/iu,
  ],
  ["電影與影視作品", /\bimdb\b|\bletterboxd\b|影評|電影|紀錄片/iu],
  [
    "音樂與聲音",
    /\bspotify\b|\bbandcamp\b|\bsoundcloud\b|音樂|作曲|編曲|音效/iu,
  ],
];
const id = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 20);
function key(url: URL) {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid|msclkid)$/i.test(k)) u.searchParams.delete(k);
  return u.href;
}
function day(at: number, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
export function analyze(
  rows: Row[],
  from: number,
  to: number,
  zone: string,
  feedback: Feedback[] = [],
) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const date = (at: number) => format.format(at);
  const segmenter = new Intl.Segmenter("zh-TW", { granularity: "word" });
  const corrections = new Map(feedback.map((f) => [f.topic, f]));
  const latest = rows.reduce(
    (m, r) => (r.visitedAt < to ? Math.max(m, r.visitedAt) : m),
    0,
  );
  const end = from === 0 ? Math.min(to, latest + 1) : to;
  const span = from === 0 ? 30 * DAY : to - from;
  const currentStart = from === 0 ? Math.max(0, end - span) : from;
  const previousStart = Math.max(0, currentStart - span);
  const documents = new Map<
    string,
    {
      url: string;
      title: string;
      host: string;
      tags: Set<string>;
      days: Set<string>;
      months: Set<string>;
      first: number;
      last: number;
      rows: Row[];
    }
  >();
  const candidates = new Map<string, Set<string>>();
  const titles = new Map<string, string[]>();
  let selected = 0,
    eligible = 0,
    nonWeb = 0,
    utility = 0;
  const terms = (title: string) => {
    if (titles.has(title)) return titles.get(title)!;
    const found = [
      ...new Set(
        [...segmenter.segment(title.toLowerCase())]
          .filter((s) => s.isWordLike)
          .map((s) => s.segment)
          .filter(
            (w) =>
              w.length >= 2 &&
              w.length <= 32 &&
              !stop.has(w) &&
              !/^\d+$/.test(w) &&
              !/^\p{Script=Latin}{1,2}$/u.test(w) &&
              /^[\p{L}\p{N}-]+$/u.test(w),
          ),
      ),
    ];
    titles.set(title, found);
    return found;
  };
  for (const row of rows) {
    if (row.visitedAt >= to || (row.visitedAt < previousStart && from !== 0))
      continue;
    const inside = row.visitedAt >= from;
    if (inside) selected++;
    const safe = webUrl(row.url);
    if (!safe) {
      if (inside) nonWeb++;
      continue;
    }
    const u = new URL(safe),
      title = row.title.trim();
    const common =
      /^(www\.)?(google\.[a-z.]+|facebook.com|instagram.com|youtube.com|docs.google.com|accounts.google.com|mail.google.com|x.com)$/i.test(
        u.hostname,
      );
    if (
      /(^|\.)(mail.google.com|outlook.com|outlook.office.com|accounts.google.com)$/.test(
        u.hostname,
      ) ||
      /\b(inbox|收件匣)\b/i.test(title) ||
      /\/(login|signin|sign-in|logout|callback|oauth)(\/|$)/i.test(
        u.pathname,
      ) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) ||
      u.hostname === "localhost" ||
      (common && u.pathname === "/" && !u.search) ||
      !title ||
      /^(new tab|新分頁|google docs|google sheets|google drive|facebook|instagram|loading|載入中|收件匣)$/i.test(
        title,
      )
    ) {
      if (inside) utility++;
      continue;
    }
    if (inside) eligible++;
    const url = key(u),
      dateKey = date(row.visitedAt);
    let doc = documents.get(url);
    if (!doc) {
      doc = {
        url,
        title,
        host: u.hostname,
        tags: new Set(),
        days: new Set(),
        months: new Set(),
        first: row.visitedAt,
        last: row.visitedAt,
        rows: [],
      };
      documents.set(url, doc);
    }
    if (row.visitedAt >= doc.last) doc.title = title;
    doc.rows.push(row);
    doc.first = Math.min(doc.first, row.visitedAt);
    doc.last = Math.max(doc.last, row.visitedAt);
    if (inside) {
      doc.days.add(dateKey);
      doc.months.add(dateKey.slice(0, 7));
    }
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {}
    const text = title + " " + path;
    for (const [label, pattern] of rules)
      if (pattern.test(text)) doc.tags.add(label);
    for (const term of terms(title.split(/\s[|｜]\s|\s[-–—]\s/)[0])) {
      if (!candidates.has(term)) candidates.set(term, new Set());
      candidates.get(term)!.add(url);
    }
  }
  // Candidate terms require several distinct pages; repeated refreshes cannot invent a topic.
  const accepted = new Set(
    [...candidates]
      .filter(
        ([term, urls]) =>
          urls.size >= 3 &&
          new Set(
            [...urls].map((url) => new URL(url).hostname.replace(/^www\./, "")),
          ).size >= 2 &&
          !/\d/.test(term) &&
          ![...urls].some((url) =>
            new URL(url).hostname.toLowerCase().includes(term),
          ) &&
          !rules.some(
            ([label, re]) =>
              label.toLowerCase().includes(term) || re.test(term),
          ),
      )
      .map(([term]) => term),
  );
  for (const doc of documents.values())
    for (const row of doc.rows)
      for (const term of terms(row.title.split(/\s[|｜]\s|\s[-–—]\s/)[0]))
        if (accepted.has(term)) doc.tags.add(term);
  type Bucket = {
    id: string;
    label: string;
    original: string;
    kind: string;
    mode: string;
    docs: typeof documents;
    days: Set<string>;
    months: Set<string>;
    current: Set<string>;
    previous: Set<string>;
    first: number;
    last: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const doc of documents.values())
    for (const label of doc.tags) {
      const topic = id(label),
        f = corrections.get(topic);
      if (f?.mode === "exclude") continue;
      let b = buckets.get(topic);
      if (!b) {
        b = {
          id: topic,
          label: f?.label || label,
          original: label,
          mode: f?.mode || "interest",
          kind: rules.some(([l]) => l === label) ? "rule" : "term",
          docs: new Map(),
          days: new Set(),
          months: new Set(),
          current: new Set(),
          previous: new Set(),
          first: Infinity,
          last: 0,
        };
        buckets.set(topic, b);
      }
      b.docs.set(doc.url, doc);
      for (const row of doc.rows) {
        const d = date(row.visitedAt),
          unit = doc.url + "\n" + d;
        if (row.visitedAt >= currentStart && row.visitedAt < end)
          b.current.add(unit);
        if (row.visitedAt >= previousStart && row.visitedAt < currentStart)
          b.previous.add(unit);
        if (row.visitedAt >= from) {
          b.days.add(d);
          b.months.add(d.slice(0, 7));
          b.first = Math.min(b.first, row.visitedAt);
          b.last = Math.max(b.last, row.visitedAt);
        }
      }
    }
  const all = [...buckets.values()].filter(
    (b) =>
      b.days.size >= 2 &&
      [...b.docs.values()].filter((d) => d.days.size).length >= 2,
  );
  const evidence = new Map<string, any[]>();
  const topics = all
    .map((b) => {
      const docs = [...b.docs.values()].filter((d) => d.days.size);
      evidence.set(
        b.id,
        docs
          .sort((a, b) => b.last - a.last)
          .map((d) => ({
            url: d.url,
            title: d.title,
            days: d.days.size,
            months: d.months.size,
            first: d.rows.reduce(
              (first, r) =>
                r.visitedAt >= from ? Math.min(first, r.visitedAt) : first,
              Infinity,
            ),
            last: d.last,
            source: d.rows.at(-1)!.source,
          })),
      );
      return {
        id: b.id,
        label: b.label,
        original: b.original,
        kind: b.kind,
        mode: b.mode,
        days: b.days.size,
        months: b.months.size,
        pages: docs.length,
        sites: new Set(docs.map((d) => d.host)).size,
        first: b.first,
        last: b.last,
        score:
          Math.round(
            (b.days.size + Math.log2(docs.length + 1) * 2 + b.months.size * 3) *
              10,
          ) / 10,
        current: b.current.size,
        previous: b.previous.size,
      };
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  // Same-document overlap, not a claim that two interests are rare in the population.
  const topicSet = new Set(topics.map((t) => t.id));
  const pairs = new Map<
    string,
    { a: string; b: string; pages: Set<string>; days: Set<string> }
  >();
  for (const doc of documents.values())
    if (doc.days.size) {
      const tags = [...doc.tags]
        .map(id)
        .filter((t) => topicSet.has(t))
        .sort();
      for (let i = 0; i < tags.length; i++)
        for (let j = i + 1; j < tags.length; j++) {
          const k = tags[i] + ":" + tags[j];
          let pair = pairs.get(k);
          if (!pair) {
            pair = {
              a: tags[i],
              b: tags[j],
              pages: new Set(),
              days: new Set(),
            };
            pairs.set(k, pair);
          }
          pair.pages.add(doc.url);
          for (const d of doc.days) pair.days.add(d);
        }
    }
  const intersections = [...pairs.entries()]
    .filter(([, p]) => p.pages.size >= 2 && p.days.size >= 2)
    .map(([k, p]) => {
      const docs = [...p.pages].map((url) => documents.get(url)!);
      evidence.set(
        k,
        docs.map((d) => ({
          url: d.url,
          title: d.title,
          days: d.days.size,
          last: d.last,
        })),
      );
      return {
        id: k,
        a: topics.find((t) => t.id === p.a)!.label,
        b: topics.find((t) => t.id === p.b)!.label,
        pages: p.pages.size,
        days: p.days.size,
      };
    })
    .sort((a, b) => b.days - a.days || b.pages - a.pages);
  const currentUnits = new Set<string>(),
    previousUnits = new Set<string>();
  for (const doc of documents.values())
    for (const r of doc.rows) {
      const unit = doc.url + "\n" + date(r.visitedAt);
      if (r.visitedAt >= currentStart && r.visitedAt < end)
        currentUnits.add(unit);
      else if (r.visitedAt >= previousStart && r.visitedAt < currentStart)
        previousUnits.add(unit);
    }
  const changes = [...buckets.values()]
    .filter((b) => b.current.size + b.previous.size >= 3)
    .map((b) => {
      const current = b.current.size,
        previous = b.previous.size;
      const nowShare = currentUnits.size ? current / currentUnits.size : 0,
        oldShare = previousUnits.size ? previous / previousUnits.size : 0;
      if (!evidence.has(b.id))
        evidence.set(
          b.id,
          [...b.docs.values()].map((d) => ({
            url: d.url,
            title: d.title,
            days: d.days.size,
            last: d.last,
          })),
        );
      return {
        id: b.id,
        label: b.label,
        current,
        previous,
        delta: Math.round((nowShare - oldShare) * 1000) / 10,
        type:
          current === 0
            ? "淡出"
            : previous === 0
              ? "本期出現"
              : nowShare > oldShare
                ? "升溫"
                : "降溫",
      };
    })
    .filter(
      (t) => Math.abs(t.delta) >= 1 || t.current === 0 || t.previous === 0,
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const longterm = [...documents.values()]
    .filter((d) => d.months.size >= 2 && d.days.size >= 3)
    .map((d) => ({
      id: id(d.url),
      url: d.url,
      title: d.title,
      days: d.days.size,
      months: d.months.size,
      first: d.rows.reduce(
        (first, r) =>
          r.visitedAt >= from ? Math.min(first, r.visitedAt) : first,
        Infinity,
      ),
      last: d.last,
      dormant: latest - d.last >= 30 * DAY,
    }))
    .sort((a, b) => b.months - a.months || b.days - a.days);
  // Group paths by device/browser/profile. No inferred cross-device or cross-profile chain.
  const groups = new Map<string, Row[]>();
  for (const doc of documents.values())
    for (const r of doc.rows)
      if (r.visitedAt >= from) {
        const k = JSON.stringify([
          r.deviceId,
          r.source.browser,
          r.source.profile,
        ]);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }
  const paths: any[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.visitedAt - b.visitedAt || a.id.localeCompare(b.id));
    let chain: Row[] = [];
    const finish = () => {
      if (chain.length < 3) return;
      const seen = new Set<string>();
      const unique = chain.filter((r) => {
        const k = key(new URL(r.url));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (unique.length < 3) return;
      const counts = new Map<string, number>();
      for (const r of unique)
        for (const label of documents.get(key(new URL(r.url)))!.tags) {
          const topic = id(label);
          if (topicSet.has(topic))
            counts.set(topic, (counts.get(topic) || 0) + 1);
        }
      const shared = [...counts]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])[0];
      if (!shared) return;
      paths.push({
        id: id(JSON.stringify(chain.map((r) => [r.deviceId, r.id]))),
        topic: topics.find((t) => t.id === shared[0])!.label,
        start: chain[0].visitedAt,
        end: chain.at(-1)!.visitedAt,
        source: chain[0].source,
        total: unique.length,
        steps: unique.map((r) => ({
          url: r.url,
          title: r.title,
          at: r.visitedAt,
        })),
      });
    };
    for (const r of group) {
      if (chain.length && r.visitedAt - chain.at(-1)!.visitedAt > 30 * 60000) {
        finish();
        chain = [];
      }
      chain.push(r);
    }
    finish();
  }
  paths.sort((a, b) => b.start - a.start);
  for (const path of paths) {
    evidence.set(
      path.id,
      path.steps.map((r: any) => ({ ...r, last: r.at })),
    );
    path.steps = path.steps.slice(0, 5);
  }
  const matched = new Set(all.flatMap((b) => [...b.docs.keys()]));
  return {
    evidence,
    report: {
      version: 1,
      from,
      to,
      zone,
      selected,
      eligible,
      nonWeb,
      utility,
      pages: [...documents.values()].filter((d) => d.days.size).length,
      matchedPages: [...documents.values()].filter(
        (d) => d.days.size && matched.has(d.url),
      ).length,
      topics,
      changes: currentUnits.size && previousUnits.size ? changes : [],
      intersections,
      longterm,
      paths,
      comparison: {
        from: currentStart,
        to: end,
        previousFrom: previousStart,
        previousTo: currentStart,
        currentUnits: currentUnits.size,
        previousUnits: previousUnits.size,
        anchoredToLatest: from === 0,
        comparable: currentUnits.size > 0 && previousUnits.size > 0,
      },
      feedback,
    },
  };
}
