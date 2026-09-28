import test from "node:test";
import assert from "node:assert/strict";
import { analyze, type Row } from "../src/insights/analyze";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server/app";
import { Registry } from "../src/accounts/registry";
const day = 86400000,
  base = Date.UTC(2026, 0, 1),
  end = Date.UTC(2026, 2, 15);
const source = { browser: "Brave", profile: "Default", device: "Fixture" };
function row(
  url: string,
  title: string,
  at: number,
  n = 0,
  profile = "Default",
): Row {
  return {
    id: String(n),
    deviceId: "fixture-device",
    url,
    title,
    visitedAt: at,
    source: { ...source, profile },
  };
}
function dataset() {
  const rows: Row[] = [];
  for (const d of [0, 1, 35, 36, 60])
    for (let n = 0; n < 3; n++)
      rows.push(
        row(
          `https://example.test/article${n}`,
          `Cloudflare OAuth guide ${n}`,
          base + d * day + n * 60000,
          rows.length,
        ),
      );
  for (let n = 0; n < 3; n++)
    rows.push(
      row(
        `https://db.test/sql${n}`,
        "SQLite database",
        base + 60 * day + n * 60000,
        rows.length,
      ),
    );
  return rows;
}
test("five insights expose evidence; refreshes do not inflate topic scores, and paths keep source boundaries", () => {
  const rows = dataset();
  const a = analyze(rows, 0, end, "Asia/Taipei");
  assert.ok(a.report.topics.find((t) => t.label.includes("OAuth")));
  assert.ok(a.report.paths.length);
  assert.ok(a.report.intersections.length);
  assert.ok(a.report.longterm.length);
  assert.ok(a.report.changes.length);
  const b = analyze(
    [
      ...rows,
      ...Array.from({ length: 100 }, (_, n) => ({
        ...rows[0],
        id: "repeat" + n,
      })),
    ],
    0,
    end,
    "Asia/Taipei",
  );
  assert.deepEqual(a.report.topics, b.report.topics);
  for (const t of a.report.topics) assert.ok(a.evidence.get(t.id)?.length);
  const split = dataset()
    .slice(0, 3)
    .map((r, n) => ({ ...r, source: { ...r.source, profile: String(n) } }));
  assert.equal(analyze(split, 0, end, "Asia/Taipei").report.paths.length, 0);
});
test("utility/non-web rows stay accounted for; malformed paths, unsafe URLs and sparse periods are safe", () => {
  const rows = [
    row("chrome://settings", "Settings", base),
    row("https://google.com/", "Google", base),
    row("https://example.test/%E0%A4%A", "SQLite content", base),
    row("https://u:p@example.test/", "secret", base),
  ];
  const a = analyze(rows, 0, end, "Asia/Taipei");
  assert.equal(a.report.selected, 4);
  assert.equal(a.report.nonWeb, 2);
  assert.equal(a.report.utility, 1);
  assert.equal(a.report.eligible, 1);
  assert.equal(a.report.topics.length, 0);
  const empty = analyze(rows, end, end + day, "Asia/Taipei");
  assert.equal(empty.report.selected, 0);
  assert.equal(empty.report.comparison.comparable, false);
});
test("changes compare distinct page-days and require both windows; feedback removes a topic and renames work content", () => {
  const rows = dataset();
  const all = analyze(rows, 0, end, "Asia/Taipei");
  const topic = all.report.topics[0];
  const excluded = analyze(rows, 0, end, "Asia/Taipei", [
    { topic: topic.id, label: topic.label, mode: "exclude" },
  ]);
  assert.ok(!excluded.report.topics.some((t) => t.id === topic.id));
  assert.ok(!excluded.report.changes.some((t) => t.id === topic.id));
  const renamed = analyze(rows, 0, end, "Asia/Taipei", [
    { topic: topic.id, label: "工作專案", mode: "work" },
  ]);
  assert.equal(
    renamed.report.topics.find((t) => t.id === topic.id)?.label,
    "工作專案",
  );
  const one = analyze(rows.slice(-3), 0, end, "Asia/Taipei");
  assert.equal(one.report.comparison.comparable, false);
  assert.equal(
    all.report.comparison.to,
    Math.max(...rows.map((r) => r.visitedAt)) + 1,
  );
});
test("private analysis and feedback are account isolated; evidence paginates without a row cap", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const master = "insights-owner-token-more-than-thirty-two-characters";
    const app = createApp(db, master);
    const registry = new Registry(db, master);
    for (let n = 0; n < 45; n++) {
      const r = row(
        `https://example.test/p${n}`,
        "OAuth Cloudflare",
        base + (n % 3) * day,
        n,
      );
      db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)").run(
        r.deviceId,
        r.id,
        "visit",
        r.visitedAt,
        r.visitedAt,
        JSON.stringify(r),
        "example.test",
        JSON.stringify(r.source),
      );
    }
    const q = `from=0&to=${end}&zone=Asia%2FTaipei`;
    const req = (p: string, token = master, method = "GET", body?: unknown) =>
      app.request(p, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    assert.equal((await req("/api/insights?" + q, "wrong")).status, 401);
    assert.equal(
      (await req("/api/insights?from=0&to=1&zone=wrong")).status,
      400,
    );
    const first = await (await req("/api/insights?" + q)).json();
    assert.equal(first.selected, 45);
    const topic = first.topics[0].id;
    const filtered = await (
      await req("/api/insights?" + q + "&q=OAuth")
    ).json();
    assert.equal(filtered.counts.topics, 1);
    const paged = await (
      await req("/api/insights?" + q + "&limit=1&offset=1")
    ).json();
    assert.equal(paged.topics.length, 1);
    assert.notEqual(paged.topics[0].id, topic);
    const e = await (
      await req(`/api/insights/evidence?${q}&topic=${topic}&offset=40`)
    ).json();
    assert.equal(e.total, 45);
    assert.equal(e.items.length, 5);
    const second = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    db.prepare("INSERT INTO accounts(id,handle,name) VALUES(?,?,?)").run(
      second,
      "second",
      "Second",
    );
    registry.repository(second); // table is initialized explicitly for a fixture account
    db.exec(
      `CREATE TABLE account_events_${second.replaceAll("-", "")} AS SELECT * FROM events WHERE 0`,
    );
    const other = registry.credential(second);
    assert.equal(
      (await (await req("/api/insights?" + q, other)).json()).selected,
      0,
    );
    assert.equal(
      (
        await (
          await req(`/api/insights/evidence?${q}&topic=${topic}`, other)
        ).json()
      ).total,
      0,
    );
    assert.equal(
      (
        await req(
          "/api/insights/feedback",
          registry.credential("owner", "device"),
          "PUT",
          { topic, mode: "exclude" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req("/api/insights/feedback", master, "PUT", {
          topic,
          mode: "exclude",
          label: "hidden",
        })
      ).status,
      200,
    );
    assert.ok(
      !(await (await req("/api/insights?" + q)).json()).topics.some(
        (t: any) => t.id === topic,
      ),
    );
    assert.equal(
      (await (await req("/api/insights?" + q, other)).json()).feedback.length,
      0,
    );
    assert.equal(
      (await req("/api/insights/feedback/" + topic, master, "DELETE")).status,
      200,
    );
    assert.ok(
      (await (await req("/api/insights?" + q)).json()).topics.some(
        (t: any) => t.id === topic,
      ),
    );
  } finally {
    db.close();
  }
});
