import test from "node:test";
import assert from "node:assert/strict";
import { estimateDwell } from "../src/browsing/dwell";
import type { Row } from "../src/insights/analyze";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server/app";
const row = (
  id: string,
  time: number,
  url = "https://example.test/" + id,
  profile = "Default",
): Row => ({
  id,
  url,
  title: id,
  visitedAt: time,
  deviceId: "device",
  source: { browser: "Brave", profile, device: "Fixture" },
});
test("strict one/three-minute thresholds assign gaps to preceding URLs, sum returns and leave final visits unknown", () => {
  const rows = [
    row("a", 1000),
    row("b", 31000),
    row("a", 121000),
    row("c", 151000),
    row("d", 331000),
  ];
  const three = estimateDwell(rows, 0, 400000, 180);
  assert.equal(three.totalMilliseconds, 150000);
  assert.equal(three.pages.find((p) => p.title === "a")?.milliseconds, 60000);
  assert.equal(three.excluded.longGaps, 1);
  assert.equal(three.excluded.lastVisits, 1);
  const one = estimateDwell(rows, 0, 400000, 60);
  assert.equal(one.totalMilliseconds, 60000);
  assert.equal(
    estimateDwell([row("a", 0), row("b", 60000)], 0, 100000, 60)
      .totalMilliseconds,
    0,
  );
});
test("estimates retain neighbors beyond date bounds, do not cross profiles, and handle duplicate/tied/internal records", () => {
  const rows = [
    row("a", 0),
    row("dup", 0, "https://example.test/a"),
    row("b", 30000),
    row("c", 60000),
    row("x", 60000),
    row("last", 90000),
  ];
  const d = estimateDwell(rows, 10000, 40000, 60);
  assert.equal(d.totalMilliseconds, 30000);
  const all = estimateDwell(rows, 0, 100000, 60);
  assert.equal(all.excluded.duplicates, 1);
  assert.equal(all.excluded.ambiguous, 2);
  assert.equal(all.totalMilliseconds, 60000);
  assert.equal(
    estimateDwell(
      [row("a", 0), row("b", 30000, undefined, "Other")],
      0,
      40000,
      60,
    ).totalMilliseconds,
    0,
  );
  const internal = estimateDwell(
    [row("a", 0), row("b", 10000, "chrome://settings"), row("c", 30000)],
    0,
    40000,
    60,
  );
  assert.equal(internal.totalMilliseconds, 10000);
  assert.equal(internal.excluded.nonWeb, 1);
});
test("dwell API is private, validates thresholds, supports page search and preserves stored events", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const key = "dwell-private-token-more-than-32-characters",
      app = createApp(db, key);
    for (const r of [row("a", 0), row("b", 30000), row("c", 90000)])
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
    const path = "/api/dwell?from=0&to=100000&threshold=180";
    assert.equal((await app.request(path)).status, 401);
    const req = (p: string) =>
      app.request(p, { headers: { authorization: "Bearer " + key } });
    const d = await (await req(path)).json();
    assert.equal(d.totalMilliseconds, 90000);
    assert.equal(d.totalPages, 2);
    const filtered = await (await req(path + "&q=example.test/a")).json();
    assert.equal(filtered.matchedPages, 1);
    assert.equal(filtered.totalMilliseconds, 90000);
    assert.equal((await req(path.replace("180", "120"))).status, 400);
    assert.equal(db.prepare("SELECT count(*) AS n FROM events").get()!.n, 3);
  } finally {
    db.close();
  }
});
