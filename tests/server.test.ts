import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server/app.ts";
import { closeInterval } from "../src/shared/events.ts";
const token = "test-only-token-".repeat(4);
const source = {
  browser: "Zen",
  profile: "Default",
  device: "Test",
  method: "native",
};
const deviceId = "2b9b1f4a-245e-4562-a1f8-a88834916f63";
const event = {
  kind: "visit",
  id: "visit:1",
  sourceVisitId: "1",
  url: "about:config",
  title: "Settings",
  visitedAt: 100,
  transition: "1",
};
function setup() {
  const db = new DatabaseSync(":memory:");
  return { db, app: createApp(db, token) };
}

test("every private endpoint rejects anonymous and incorrect credentials", async () => {
  const { db, app } = setup();
  for (const route of [
    "/api/sources",
    "/api/report?from=0&to=1000",
    "/api/visits?from=0&to=1000",
    "/api/events",
  ]) {
    for (const authorization of ["", "Bearer wrong"]) {
      const res = await app.request(route, {
        method: route.endsWith("events") ? "POST" : "GET",
        headers: { authorization },
      });
      assert.equal(res.status, 401);
    }
  }
  db.close();
});
test("native import preserves non-HTTP rows, stable provenance and idempotent retry counts", async () => {
  const { db, app } = setup();
  const batch = {
    deviceId,
    source,
    events: [
      event,
      { ...event, id: "visit:2", url: "file:///private/note.txt" },
    ],
  };
  const post = () =>
    app.request("/api/events", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });
  assert.deepEqual(await (await post()).json(), {
    accepted: 2,
    inserted: 2,
    duplicates: 0,
    rejected: 0,
    rejections: [],
  });
  assert.deepEqual(await (await post()).json(), {
    accepted: 2,
    inserted: 0,
    duplicates: 2,
    rejected: 0,
    rejections: [],
  });
  const response = await app.request(
    "/api/visits?from=0&to=1000&limit=1&offset=1",
    { headers: { authorization: `Bearer ${token}` } },
  );
  const data = await response.json();
  assert.equal(data.total, 2);
  assert.equal(data.visits.length, 1);
  assert.deepEqual(data.visits[0].source, source);
  db.close();
});
test("reports explicit rejected row indexes, does not hide malformed events", async () => {
  const { db, app } = setup();
  const response = await app.request("/api/events", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceId,
      source,
      events: [event, { ...event, id: "bad", visitedAt: "yesterday" }, null],
    }),
  });
  const data = await response.json();
  assert.equal(data.accepted, 1);
  assert.equal(data.rejected, 2);
  assert.equal(data.rejections[0].index, 1);
  assert.equal(data.rejections[1].index, 2);
  db.close();
});
test("unlimited historical range, pagination, title search and clipped cross-day attention", async () => {
  const { db, app } = setup();
  const headers = {
    authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  await app.request("/api/events", {
    method: "POST",
    headers,
    body: JSON.stringify({
      deviceId,
      source,
      events: [
        event,
        { ...event, id: "old", title: "Ancient unique title", visitedAt: -100 },
        {
          kind: "attention",
          id: "attention:1",
          url: "https://example.org/",
          startAt: 50,
          endAt: 150,
        },
      ],
    }),
  });
  const report = await (
    await app.request("/api/report?from=100&to=200", { headers })
  ).json();
  assert.equal(report.visitCount, 1);
  assert.equal(
    report.sites.find((s: { domain: string }) => s.domain === "example.org")
      .milliseconds,
    50,
  );
  const history = await (
    await app.request("/api/visits?from=-8640000000000000&to=200&q=ancient", {
      headers,
    })
  ).json();
  assert.equal(history.total, 1);
  assert.equal(history.visits[0].id, "old");
  db.close();
});
test("foreground estimates discard sleep, stale worker state, idle and backwards clocks", () => {
  const previous = { url: "https://example.org/", tabId: 1, at: 1000 };
  assert.equal(closeInterval(previous, 100_000), null);
  assert.equal(closeInterval(previous, 10_000, true), null);
  assert.equal(closeInterval(previous, 0), null);
  const restored = JSON.parse(JSON.stringify(previous));
  assert.equal(closeInterval(restored, 31000)?.kind, "attention");
});

test("standalone ingestion shares storage, authentication and replay semantics without exposing reports", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const ingest = createApp(db, token, "ingest");
    const app = createApp(db, token);
    assert.equal(
      (await ingest.request("/api/events", { method: "POST" })).status,
      401,
    );
    const request = {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ deviceId, source, events: [event] }),
    };
    assert.equal(
      (await (await ingest.request("/api/events", request)).json()).inserted,
      1,
    );
    assert.equal(
      (await (await app.request("/api/events", request)).json()).duplicates,
      1,
    );
    const headers = { authorization: `Bearer ${token}` };
    assert.equal(
      (await ingest.request("/api/report?from=0&to=1000", { headers })).status,
      404,
    );
    assert.equal(
      (
        await (
          await app.request("/api/report?from=0&to=1000", { headers })
        ).json()
      ).visitCount,
      1,
    );
  } finally {
    db.close();
  }
});
