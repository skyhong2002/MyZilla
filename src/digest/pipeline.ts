import { createHash } from "node:crypto";
import { webUrl } from "../shared/model";
import { isUtility, key, type Row } from "../insights/analyze";
import { DigestStore, type Taxon } from "./store";

export const CLASSIFIER = "gpt-6-luna";
export const INTERPRETER = "gpt-6.1-sol";
export const MISC = "工具與雜項";
// Bump when prompts or the stored shape change so the next run regenerates.
const VERSION = 1;
const DAY = 86400000;
const GAP = 30 * 60000;

export type Ask = (
  step: string,
  model: string,
  effort: "low" | "medium" | "high",
  prompt: string,
  schema: object,
) => Promise<any>;
export type Page = {
  id: string;
  url: string;
  host: string;
  path: string;
  title: string;
  visits: number;
  days: Set<string>;
  earlierMonths: Set<string>;
  topic: string;
};
export type Session = {
  id: string;
  key: string;
  start: number;
  end: number;
  source: { browser: string; profile: string };
  pages: Page[];
  interpretation?: Interpretation;
};
type Interpretation = {
  activity: string;
  intent: string;
  outcome: "done" | "open" | "browse" | "unclear";
  confidence: "high" | "medium" | "low";
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
const formatter = (zone: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("zh-TW", { timeZone: zone, hour12: false, ...opts });

// Models occasionally slip into simplified characters despite the prompt; these have one traditional form.
const simplified: Record<string, string> = Object.fromEntries(
  [
    ..."凭们这个对说时为会没还过进从实现发关经问题开应该样点边动书学页览录记网络与资讯线续显确认让虽仅较务专项组织级类数据构设计读写诉单练习报钱费间长东车门见观视频国际电脑场运营议论试验区选择传统态标签",
  ].map((c, i) => [
    c,
    "憑們這個對說時為會沒還過進從實現發關經問題開應該樣點邊動書學頁覽錄記網絡與資訊線續顯確認讓雖僅較務專項組織級類數據構設計讀寫訴單練習報錢費間長東車門見觀視頻國際電腦場運營議論試驗區選擇傳統態標籤"[
      i
    ],
  ]),
);
export const traditional = (text: string) =>
  text.replace(/[一-鿿]/g, (c) => simplified[c] ?? c);
const STYLE = "一律使用台灣繁體中文用字，不要出現簡體字。";

// Content pages in the window, plus the months each page was seen before it; sessions are split per device/browser/profile.
export function prepare(rows: Row[], from: number, to: number, zone: string) {
  const date = (at: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(at);
  const pages = new Map<string, Page>();
  const earlier = new Map<string, Set<string>>();
  const visits: (Row & { key: string })[] = [];
  let excluded = 0;
  for (const row of rows) {
    if (row.visitedAt >= to) continue;
    const safe = webUrl(row.url);
    const title = row.title.trim();
    const u = safe ? new URL(safe) : undefined;
    const k = u && !isUtility(u, title) ? key(u) : undefined;
    if (row.visitedAt < from) {
      if (k) {
        if (!earlier.has(k)) earlier.set(k, new Set());
        earlier.get(k)!.add(date(row.visitedAt).slice(0, 7));
      }
      continue;
    }
    if (!k) {
      excluded++;
      continue;
    }
    let page = pages.get(k);
    if (!page) {
      const url = new URL(k);
      let path = url.pathname + url.search;
      try {
        path = decodeURIComponent(path);
      } catch {}
      page = {
        id: "P" + (pages.size + 1),
        url: k,
        host: url.hostname.replace(/^www\./, ""),
        path: path.slice(0, 100),
        title: "",
        visits: 0,
        days: new Set(),
        earlierMonths: new Set(),
        topic: "未分類",
      };
      pages.set(k, page);
    }
    page.title = title.slice(0, 140);
    page.visits++;
    page.days.add(date(row.visitedAt));
    visits.push({ ...row, key: k });
  }
  for (const page of pages.values())
    page.earlierMonths = earlier.get(page.url) ?? new Set();
  const groups = new Map<string, typeof visits>();
  for (const r of visits) {
    const g = JSON.stringify([r.deviceId, r.source.browser, r.source.profile]);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const sessions: Session[] = [];
  for (const group of groups.values()) {
    let chain: typeof visits = [];
    const finish = () => {
      const unique = [...new Set(chain.map((r) => r.key))].map((k) =>
        pages.get(k)!,
      );
      if (unique.length >= 3)
        sessions.push({
          id: "",
          key: hash([chain[0].visitedAt, unique.map((p) => p.url)]),
          start: chain[0].visitedAt,
          end: chain.at(-1)!.visitedAt,
          source: chain[0].source,
          pages: unique,
        });
    };
    for (const r of group) {
      if (chain.length && r.visitedAt - chain.at(-1)!.visitedAt > GAP) {
        finish();
        chain = [];
      }
      chain.push(r);
    }
    if (chain.length) finish();
  }
  sessions.sort((a, b) => a.start - b.start);
  sessions.forEach((s, i) => (s.id = "S" + (i + 1)));
  return {
    pages: [...pages.values()],
    sessions,
    visits: visits.length,
    excluded,
  };
}

const obj = (properties: Record<string, object>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const str = { type: "string" },
  strs = { type: "array", items: str };
const labelOf = (t: Taxon) => (t.facet ? `${t.group}／${t.facet}` : t.group);

export type RunResult =
  | { status: "skipped"; reason: string }
  | { status: "unchanged" | "created"; calls: string[] };

// Rerunnable: pages, labels and sessions already stored are reused; unchanged data makes no model call.
export async function runDigest(
  store: DigestStore,
  source: { rows(): Row[]; revision(): unknown },
  ask: Ask,
  { days = 7, zone = "Asia/Taipei", force = false, now = Date.now() } = {},
): Promise<RunResult> {
  const revision = JSON.stringify([VERSION, days, zone, source.revision()]);
  const previous = store.latest();
  if (!force && previous?.revision === revision)
    return { status: "skipped", reason: "沒有新的瀏覽紀錄" };
  const rows = source.rows();
  if (!rows.length) return { status: "skipped", reason: "尚無瀏覽紀錄" };
  const latest = rows.reduce((m, r) => Math.max(m, r.visitedAt), 0);
  const from = latest + 1 - days * DAY,
    to = latest + 1;
  const { pages, sessions, visits, excluded } = prepare(rows, from, to, zone);
  const calls: string[] = [];
  const call: Ask = (step, ...rest) => {
    calls.push(step);
    return ask(step, ...rest);
  };
  const fmt = (at: number, opts: Intl.DateTimeFormatOptions) =>
    formatter(zone, opts).format(at);
  const clock = (at: number) => fmt(at, { hour: "2-digit", minute: "2-digit" });
  const day = (at: number) =>
    fmt(at, { month: "numeric", day: "numeric", weekday: "short" });
  const isoDate = (at: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(at);

  // 1. Classify new pages; existing labels are offered first so names stay stable across runs.
  const topics = store.pageTopics();
  const taxonomy = store.taxonomy();
  const fresh = pages.filter((p) => !topics.has(p.url));
  const runLabels = new Set<string>();
  const known = () => [...new Set([...taxonomy.values()].map(labelOf))].sort();
  for (let i = 0; i < fresh.length; i += 300) {
    const batch = fresh.slice(i, i + 300);
    const answer = await call(
      `classify-${i / 300 + 1}`,
      CLASSIFIER,
      "low",
      `你在幫一位使用者整理自己的瀏覽記錄。為每個頁面指定一個主題標籤。${STYLE}
規則：
- 能對上既有標籤就原樣沿用（包含「主題／面向」的寫法）。既有標籤：${known().join("、") || "（尚無）"}
- 本次已用過的新標籤也要沿用：${[...runLabels].join("、") || "（尚無）"}
- 對不上才新增。新標籤粒度適中，指一個專案、活動或興趣，例如「自架伺服器與部署」「口琴演奏」「台灣地方歷史」；不要細到單一文章，也不要粗到「科技」。
- 純工具或雜項頁面（搜尋結果、設定頁、翻譯工具、雲端硬碟清單等）標為「${MISC}」。
- 每個 id 都要出現一次。
頁面（id｜網站｜路徑｜標題）：
${batch.map((p) => `${p.id}｜${p.host}｜${p.path}｜${p.title}`).join("\n")}`,
      obj({ pages: { type: "array", items: obj({ id: str, topic: str }) } }),
    );
    const byId = new Map<string, string>(
      answer.pages.map((p: any) => [p.id, traditional(p.topic.trim())]),
    );
    const found: [string, string][] = [];
    for (const p of batch) {
      const raw = byId.get(p.id);
      if (!raw) continue; // stays unclassified; the next run retries it
      found.push([p.url, raw]);
      topics.set(p.url, raw);
      runLabels.add(raw);
    }
    store.savePageTopics(found, CLASSIFIER);
  }
  for (const p of pages) p.topic = topics.get(p.url) ?? "未分類";

  // 2. Fold raw labels into group/facet. Canonical labels map to themselves, so only new wording is sent.
  const own: [string, Taxon][] = [];
  for (const t of [...taxonomy.values(), { group: MISC, facet: "" }])
    if (!taxonomy.has(labelOf(t))) {
      taxonomy.set(labelOf(t), t);
      own.push([labelOf(t), t]);
    }
  store.saveTaxonomy(own);
  const unmapped = [...new Set(pages.map((p) => p.topic))].filter(
    (raw) => raw !== "未分類" && !taxonomy.has(raw),
  );
  if (unmapped.length) {
    const groups = new Map<string, Set<string>>();
    for (const t of taxonomy.values()) {
      if (!groups.has(t.group)) groups.set(t.group, new Set());
      if (t.facet) groups.get(t.group)!.add(t.facet);
    }
    const sample = (raw: string) => {
      const ps = pages.filter((p) => p.topic === raw);
      return `${raw}（${ps.length} 頁）：${ps
        .slice(0, 3)
        .map((p) => p.title)
        .join("／")}`;
    };
    const answer = await call(
      "taxonomy",
      INTERPRETER,
      "medium",
      `以下是替瀏覽記錄自動產生的主題標籤，彼此常常是同一件事的不同說法或不同面向。請整理成兩層：
- group（主題）：一個專案、活動或長期興趣，例如「口琴」「FtO 首爾出訪」「SITCON 2027」。同一件事的所有標籤都歸到同一個主題。
- facet（面向）：主題底下的一個面向，例如「演奏練習」「社團營運」「報帳核銷」。沒必要細分就留空字串。
${STYLE}
原則：
- 既有主題與面向必須原樣沿用，不要改名。
- 同義或高度重疊的標籤合併到同一個 group／facet。
- 主題總數以 10–25 個為宜；很小的零星標籤可以併入意思最近的主題，真的無處可放再自成一個主題。
- 「${MISC}」保持為獨立主題。
- 每個待整理標籤都要回覆一次，raw 必須和原文完全相同。

【既有主題與面向】
${
  [...groups]
    .map(([g, fs]) => `${g}：${[...fs].join("、") || "（無面向）"}`)
    .join("\n") || "（尚無）"
}

【待整理標籤（頁數：範例標題）】
${unmapped.map(sample).join("\n")}`,
      obj({
        labels: {
          type: "array",
          items: obj({ raw: str, group: str, facet: str }),
        },
      }),
    );
    const mapped: [string, Taxon][] = answer.labels
      .filter((l: any) => unmapped.includes(l.raw))
      .map((l: any) => [
        l.raw,
        {
          group: traditional(l.group.trim()),
          facet: traditional(l.facet.trim()),
        },
      ]);
    for (const [raw, t] of mapped) taxonomy.set(raw, t);
    store.saveTaxonomy(mapped);
  }
  const groupOf = (p: Page) => taxonomy.get(p.topic)?.group ?? p.topic;
  const facetOf = (p: Page) => taxonomy.get(p.topic)?.facet ?? "";
  const label = (p: Page) =>
    taxonomy.has(p.topic) ? labelOf(taxonomy.get(p.topic)!) : p.topic;

  // 3. Interpret sessions whose page set is new; a session that grew with new data gets a new key.
  const interpreted = store.sessions();
  const pending = sessions.filter((s) => !interpreted.has(s.key));
  for (let i = 0; i < pending.length; i += 40) {
    const batch = pending.slice(i, i + 40);
    const answer = await call(
      `sessions-${i / 40 + 1}`,
      INTERPRETER,
      "medium",
      `以下是使用者的瀏覽段落（同一瀏覽器連續瀏覽、間隔不超過 30 分鐘）。只有標題和網址，沒有內文。${STYLE}
為每段判斷：
- activity：一句話描述在做什麼，要具體（「在比較三個自架 OAuth 方案」優於「在看程式相關網頁」）。
- intent：推測背後的目的，沒把握就寫「不明」。
- outcome：看起來是 done（找到答案或完成）、open（反覆搜尋、沒有收尾）、browse（單純閒逛）、unclear。
- confidence：high / medium / low。只憑標題推測時不要給 high。
每段都要回覆。
${batch
  .map(
    (s) =>
      `${s.id} ${day(s.start)} ${clock(s.start)}–${clock(s.end)}，${s.pages.length} 頁\n` +
      s.pages
        .slice(0, 40)
        .map((p) => `  - [${label(p)}] ${p.title}（${p.host}）`)
        .join("\n") +
      (s.pages.length > 40 ? `\n  …另 ${s.pages.length - 40} 頁` : ""),
  )
  .join("\n\n")}`,
      obj({
        sessions: {
          type: "array",
          items: obj({
            id: str,
            activity: str,
            intent: str,
            outcome: {
              type: "string",
              enum: ["done", "open", "browse", "unclear"],
            },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          }),
        },
      }),
    );
    const byId = new Map(answer.sessions.map((s: any) => [s.id, s]));
    const found: [string, Interpretation][] = [];
    for (const s of batch) {
      const r = byId.get(s.id) as any;
      if (!r) continue;
      const value = {
        ...r,
        activity: traditional(r.activity),
        intent: traditional(r.intent),
      };
      delete value.id;
      found.push([s.key, value]);
      interpreted.set(s.key, value);
    }
    store.saveSessions(found, INTERPRETER);
  }
  for (const s of sessions) s.interpretation = interpreted.get(s.key);

  // 4. Digest from the compact material only; identical input reuses the previous digest.
  const stat = (name: string, ps: Page[]) => ({
    name,
    pages: ps.length,
    visits: ps.reduce((n, p) => n + p.visits, 0),
    days: new Set(ps.flatMap((p) => [...p.days])).size,
  });
  const groups = [...new Set(pages.map(groupOf))]
    .map((g) => {
      const ps = pages.filter((p) => groupOf(p) === g);
      const facets = [...new Set(ps.map(facetOf))]
        .filter(Boolean)
        .map((f) =>
          stat(
            f,
            ps.filter((p) => facetOf(p) === f),
          ),
        )
        .sort((a, b) => b.pages - a.pages);
      return { ...stat(g, ps), facets };
    })
    .sort((a, b) => b.pages - a.pages);
  const daily = [...new Set(pages.flatMap((p) => [...p.days]))]
    .sort()
    .map((d) => {
      const counts = new Map<string, number>();
      for (const p of pages)
        if (p.days.has(d) && groupOf(p) !== MISC)
          counts.set(groupOf(p), (counts.get(groupOf(p)) || 0) + 1);
      return `${d}：${[...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, n]) => `${t} ${n}`)
        .join("、")}`;
    });
  const revisits = pages
    .filter((p) => p.earlierMonths.size >= 2)
    .sort((a, b) => b.earlierMonths.size - a.earlierMonths.size)
    .slice(0, 30);
  const prompt = `你要為使用者寫一份「本週瀏覽回顧」，對象是使用者本人，語氣像一位觀察細膩的朋友，不要說教、不要空泛。${STYLE}
期間：${isoDate(from)} 至 ${isoDate(latest)}（${zone}）。只有標題和網址，沒有文章內文；不確定的推測要明說是推測。
要求：
- headline：一句話抓住本週重心。
- observations：3–5 則觀察，每則要有具體內容，而不是「你對科技很有興趣」這種話。可以談重心轉移、某件事的進展、時段習慣、主題之間的關聯。
- threads：值得繼續的線索（沒收尾的查詢、反覆回來的頁面、剛萌芽的興趣），說明為什麼值得。
- question：一個可以問使用者、幫助下次解讀更準的問題。
- 每則 observations／threads 的 evidence 必須列出支持它的段落 id（S…）或頁面 id（P…），只能用下面出現過的 id。

【主題統計】（頁數／造訪數／活躍天數；縮排為面向）
${groups
  .map(
    (g) =>
      `${g.name}：${g.pages}／${g.visits}／${g.days}` +
      g.facets
        .map((f) => `\n  ${f.name}：${f.pages}／${f.visits}／${f.days}`)
        .join(""),
  )
  .join("\n")}

【每日前五主題（頁數）】
${daily.join("\n")}

【瀏覽段落解讀】
${sessions
  .filter((s) => s.interpretation)
  .map(
    (s) =>
      `${s.id} ${day(s.start)} ${clock(s.start)}，${s.pages.length} 頁：${s.interpretation!.activity}｜目的：${s.interpretation!.intent}｜${s.interpretation!.outcome}｜${s.interpretation!.confidence}`,
  )
  .join("\n")}

【本週也出現、且在更早兩個月以上看過的頁面】
${
  revisits
    .map(
      (p) =>
        `${p.id} ${p.title}（${p.host}；更早月份 ${[...p.earlierMonths].sort().join(", ")}；本週 ${p.days.size} 天）`,
    )
    .join("\n") || "（無）"
}`;
  const inputHash = hash([VERSION, INTERPRETER, prompt]);
  // Anything the models skipped is retried next run, even if no new visits arrive.
  const complete =
    pages.every((p) => topics.has(p.url) && taxonomy.has(p.topic)) &&
    sessions.every((s) => s.interpretation);
  const stored = complete ? revision : revision + "#partial";
  if (!force && previous?.inputHash === inputHash) {
    store.touch(previous.id, stored);
    return { status: "unchanged", calls };
  }
  const answer = await call(
    "digest",
    INTERPRETER,
    "high",
    prompt,
    obj({
      headline: str,
      observations: {
        type: "array",
        items: obj({ title: str, text: str, evidence: strs }),
      },
      threads: {
        type: "array",
        items: obj({ title: str, why: str, evidence: strs }),
      },
      question: str,
    }),
  );

  // Keep only citations that exist, and store what the page needs to show them without recomputing.
  const byId = new Map<string, Session | Page>([
    ...sessions.map((s) => [s.id, s] as const),
    ...pages.map((p) => [p.id, p] as const),
  ]);
  const refs: Record<string, unknown> = {};
  let dropped = 0;
  const cite = (evidence: string[]) =>
    evidence.filter((e) => {
      const item = byId.get(e);
      if (!item) {
        dropped++;
        return false;
      }
      refs[e] =
        "pages" in item
          ? {
              kind: "session",
              start: item.start,
              end: item.end,
              source: item.source,
              activity: item.interpretation?.activity ?? "",
              outcome: item.interpretation?.outcome ?? "unclear",
              total: item.pages.length,
              pages: item.pages
                .slice(0, 20)
                .map((p) => ({ url: p.url, title: p.title })),
            }
          : {
              kind: "page",
              url: item.url,
              title: item.title,
              days: item.days.size,
              earlierMonths: [...item.earlierMonths].sort(),
            };
      return true;
    });
  const data = {
    headline: traditional(answer.headline),
    observations: answer.observations.map((o: any) => ({
      title: traditional(o.title),
      text: traditional(o.text),
      evidence: cite(o.evidence),
    })),
    threads: answer.threads.map((t: any) => ({
      title: traditional(t.title),
      why: traditional(t.why),
      evidence: cite(t.evidence),
    })),
    question: traditional(answer.question),
    refs,
    dropped,
    groups: groups.filter((g) => g.name !== MISC).slice(0, 12),
    stats: {
      visits,
      excluded,
      pages: pages.length,
      sessions: sessions.length,
      open: sessions.filter((s) => s.interpretation?.outcome === "open").length,
    },
    models: { classifier: CLASSIFIER, interpreter: INTERPRETER },
    zone,
  };
  store.saveDigest({
    created: now,
    from,
    to,
    revision: stored,
    inputHash,
    model: INTERPRETER,
    data,
  });
  return { status: "created", calls };
}
