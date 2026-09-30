import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { Row } from "../src/insights/analyze";
import {
  prepare,
  runDigest,
  traditional,
  type Ask,
} from "../src/digest/pipeline";
import { DigestStore } from "../src/digest/store";
import { createApp } from "../src/server/app";

const DAY = 86400000;
const base = Date.parse("2026-09-20T02:00:00Z");
const row = (
  id: string,
  at: number,
  url: string,
  title: string,
  profile = "Default",
): Row => ({
  id,
  url,
  title,
  visitedAt: at,
  deviceId: "device",
  source: { browser: "Brave", profile, device: "Fixture" } as any,
});
const fixture = () => [
  row("old", base - 90 * DAY, "https://harmonica.test/score", "口琴譜"),
  row("old2", base - 40 * DAY, "https://harmonica.test/score", "口琴譜"),
  row("a", base, "https://harmonica.test/score?utm_source=x", "口琴譜"),
  row("b", base + 60000, "https://harmonica.test/club", "口琴社招生"),
  row("c", base + 120000, "https://mail.google.com/mail/u/0", "收件匣"),
  row("d", base + 180000, "https://jazz.test/voicing", "爵士和聲"),
  row(
    "e",
    base + 2 * 3600000,
    "https://deploy.test/tunnel",
    "Cloudflare Tunnel",
  ),
];

// Answers every step from the prompt, like the real models, and records what was asked.
function fakeModels() {
  const calls: string[] = [];
  const prompts: Record<string, string> = {};
  const ask: Ask = async (step, _model, _effort, prompt) => {
    calls.push(step);
    prompts[step] = prompt;
    const ids = (prefix: string) =>
      [...new Set(prompt.match(new RegExp(`^\\s*(${prefix}\\d+)`, "gm")))].map(
        (s) => s.trim(),
      );
    if (step.startsWith("classify"))
      return {
        pages: ids("P").map((id) => ({
          id,
          topic: /jazz|harmonica/.test(
            prompt.split(id + "｜")[1].split("\n")[0],
          )
            ? "口琴演奏"
            : "自架部署",
        })),
      };
    if (step === "taxonomy")
      return {
        labels: [
          { raw: "口琴演奏", group: "口琴", facet: "演奏练习" },
          { raw: "自架部署", group: "自架伺服器", facet: "" },
        ],
      };
    if (step.startsWith("sessions"))
      return {
        sessions: ids("S").map((id) => ({
          id,
          activity: "在找口琴资讯",
          intent: "不明",
          outcome: "open",
          confidence: "low",
        })),
      };
    return {
      headline: "这週都在吹口琴",
      observations: [
        { title: "口琴", text: "回到舊譜", evidence: ["S1", "P1", "S99"] },
      ],
      threads: [{ title: "社團", why: "還沒報名", evidence: ["P2"] }],
      question: "要參加嗎？",
    };
  };
  return { ask, calls, prompts };
}

test("prepare drops utility pages, strips tracking and keeps earlier months of revisits", () => {
  const { pages, sessions, excluded, visits } = prepare(
    fixture(),
    base - 1,
    base + DAY,
    "Asia/Taipei",
  );
  assert.equal(excluded, 1);
  assert.equal(visits, 4);
  assert.deepEqual(
    pages.map((p) => p.url),
    [
      "https://harmonica.test/score",
      "https://harmonica.test/club",
      "https://jazz.test/voicing",
      "https://deploy.test/tunnel",
    ],
  );
  assert.deepEqual([...pages[0].earlierMonths], ["2026-06", "2026-08"]);
  // The inbox visit is excluded but a 2-hour gap still splits the tunnel page off.
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].pages.length, 3);
});

test("digest runs once per data revision, reuses stored work and keeps only valid citations", async () => {
  const db = new DatabaseSync(":memory:");
  DigestStore.migrate(db);
  const store = new DigestStore(db, "owner");
  let rows = fixture(),
    revision = 1;
  const source = { rows: () => rows, revision: () => revision };
  const first = fakeModels();
  const result = await runDigest(store, source, first.ask);
  assert.equal(result.status, "created");
  assert.deepEqual(first.calls, [
    "classify-1",
    "taxonomy",
    "sessions-1",
    "digest",
  ]);
  const d = store.latest()!.data;
  assert.equal(d.headline, "這週都在吹口琴");
  assert.deepEqual(d.observations[0].evidence, ["S1", "P1"]);
  assert.equal(d.dropped, 1);
  assert.equal(d.refs.S1.activity, "在找口琴資訊");
  assert.equal(d.refs.S1.total, 3);
  assert.deepEqual(d.refs.P1.earlierMonths, ["2026-06", "2026-08"]);
  assert.deepEqual(
    d.groups.map((g: any) => [g.name, g.pages, g.facets[0]?.name]),
    [
      ["口琴", 3, "演奏練習"],
      ["自架伺服器", 1, undefined],
    ],
  );

  const again = fakeModels();
  assert.equal((await runDigest(store, source, again.ask)).status, "skipped");
  assert.deepEqual(again.calls, []);

  // New revision, nothing the models see changed: no calls, digest kept.
  revision = 2;
  const same = fakeModels();
  assert.equal((await runDigest(store, source, same.ask)).status, "unchanged");
  assert.deepEqual(same.calls, []);

  // One new page on a new day: only that page is classified, the old session is reused.
  revision = 3;
  rows = [...rows, row("f", base + DAY, "https://deploy.test/dns", "DNS 設定")];
  const grown = fakeModels();
  assert.equal((await runDigest(store, source, grown.ask)).status, "created");
  assert.deepEqual(grown.calls, ["classify-1", "digest"]);
  assert.match(
    grown.prompts["classify-1"],
    /既有標籤：口琴／演奏練習、工具與雜項、自架伺服器\n/,
  );
  assert.doesNotMatch(grown.prompts["classify-1"], /口琴譜/);
});

test("a partial model answer is retried on the next run without new data", async () => {
  const db = new DatabaseSync(":memory:");
  DigestStore.migrate(db);
  const store = new DigestStore(db, "owner");
  const source = { rows: fixture, revision: () => 1 };
  const flaky = fakeModels();
  const ask: Ask = async (step, ...rest) => {
    const answer = await flaky.ask(step, ...rest);
    if (step.startsWith("sessions")) answer.sessions = [];
    return answer;
  };
  await runDigest(store, source, ask);
  const retry = fakeModels();
  await runDigest(store, source, retry.ask);
  assert.deepEqual(retry.calls, ["sessions-1", "digest"]);
});

test("traditional converts listed simplified characters and leaves others", () => {
  assert.equal(traditional("只凭标题"), "只憑標題");
  assert.equal(traditional("这个们"), "這個們");
  assert.equal(traditional("後台口琴"), "後台口琴");
});

test("GET /api/digest returns the account's latest digest", async () => {
  const db = new DatabaseSync(":memory:");
  const key = "digest-test-token-".repeat(3);
  const app = createApp(db, key);
  const get = async () =>
    (
      await app.request("/api/digest", {
        headers: { authorization: "Bearer " + key },
      })
    ).json();
  assert.equal((await app.request("/api/digest")).status, 401);
  assert.deepEqual(await get(), { digest: null });
  const store = new DigestStore(db, "owner");
  const { ask } = fakeModels();
  await runDigest(store, { rows: fixture, revision: () => 1 }, ask);
  const { digest } = await get();
  assert.equal(digest.headline, "這週都在吹口琴");
  assert.equal(digest.to - digest.from, 7 * DAY);
});
