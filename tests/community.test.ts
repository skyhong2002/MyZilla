import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server/app";
import { classify } from "../src/social/analysis";
const master = "test-owner-token-with-more-than-32-characters";
const password = "test-password-with-more-than-12";
function fixture() {
  const db = new DatabaseSync(":memory:");
  const app = createApp(db, master);
  const request = async (
    path: string,
    token = master,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const create = async (handle: string) => {
    const invite = await request("/api/community/invitations", master, "POST");
    const account = await request("/auth/register", "", "POST", {
      handle,
      name: handle,
      password,
      invitation: invite.data.invitation,
    });
    assert.equal(account.status, 201);
    return account.data.token as string;
  };
  const batch = {
    deviceId: "2b9b1f4a-245e-4562-a1f8-a88834916f63",
    source: {
      browser: "Zen",
      profile: "Default",
      device: "Fixture",
      method: "native",
    },
    events: [
      {
        kind: "visit",
        id: "same-visit-id",
        url: "https://github.com/private?secret=fixture",
        title: "Private fixture title",
        visitedAt: 100,
        transition: "1",
      },
    ],
  };
  return { db, app, request, create, batch };
}

test("owner claim preserves existing events; account histories, provenance and duplicate keys are isolated", async () => {
  const { db, request, create, batch } = fixture();
  try {
    assert.equal(
      (await request("/api/events", master, "POST", batch)).data.inserted,
      1,
    );
    const claimed = await request("/api/community/claim", master, "POST", {
      handle: "owner-test",
      name: "Owner",
      password,
    });
    assert.equal(claimed.status, 200);
    assert.equal(
      (
        await request("/api/community/claim", master, "POST", {
          handle: "repeat-owner",
          name: "Owner",
          password,
        })
      ).status,
      409,
    );
    const alice = await create("alice"),
      bob = await create("bob");
    assert.equal(
      (await request("/api/report?from=0&to=1000", alice)).data.visitCount,
      0,
    );
    assert.equal(
      (await request("/api/events", alice, "POST", batch)).data.inserted,
      1,
    );
    assert.equal(
      (await request("/api/events", alice, "POST", batch)).data.duplicates,
      1,
    );
    assert.equal(
      (
        await request("/api/events", bob, "POST", {
          ...batch,
          events: [
            { ...batch.events[0], url: "about:config", title: "Bob only" },
          ],
        })
      ).data.inserted,
      1,
    );
    const history = (await request("/api/visits?from=0&to=1000", alice)).data;
    assert.equal(history.total, 1);
    assert.equal(history.visits[0].title, "Private fixture title");
    assert.equal(
      (await request("/api/visits?from=0&to=1000", bob)).data.visits[0].title,
      "Bob only",
    );
    assert.equal(
      (await request("/api/report?from=0&to=1000", claimed.data.token)).data
        .visitCount,
      1,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events").get()!.n, 1);
    assert.equal(
      (await request("/api/community/invitations", alice, "POST")).status,
      403,
    );
    assert.equal(
      (await request("/api/community/claim", alice, "POST", {})).status,
      403,
    );
    const device = (await request("/api/community/device-token", alice, "POST"))
      .data.token;
    assert.equal((await request("/api/sources", device)).status, 200);
    assert.equal(
      (await request("/api/community/shares", device, "POST", { days: 7 }))
        .status,
      403,
    );
    await request("/api/community/device-token", alice, "DELETE");
    assert.equal((await request("/api/sources", device)).status, 401);
    const login = await request("/auth/login", "", "POST", {
      handle: "alice",
      password,
    });
    assert.equal(login.status, 200);
    assert.equal(
      (
        await request("/auth/login", "", "POST", {
          handle: "alice",
          password: "wrong-password-long-enough",
        })
      ).status,
      401,
    );
    await request("/api/community/logout", login.data.token, "POST");
    assert.equal((await request("/api/sources", login.data.token)).status, 401);
    const changed = await request("/api/community/password", alice, "POST", {
      current: password,
      password: password + "-new",
    });
    assert.equal(changed.status, 200);
    assert.equal((await request("/api/sources", alice)).status, 401);
    assert.equal(
      (await request("/api/sources", changed.data.token)).status,
      200,
    );
  } finally {
    db.close();
  }
});

test("matching requires accepted friendship and mutual consent, returns only category summaries, and stops after revocation", async () => {
  const { db, request, create, batch } = fixture();
  try {
    const alice = await create("alice"),
      bob = await create("bob"),
      eve = await create("eve");
    const aliceId = (await request("/api/community/me", alice)).data.id;
    const bobId = (await request("/api/community/me", bob)).data.id;
    await request("/api/events", alice, "POST", batch);
    await request("/api/events", bob, "POST", batch);
    await request("/api/community/profile", alice, "PUT", {
      name: "Alice",
      matching: true,
    });
    await request("/api/community/friends", alice, "POST", { handle: "bob" });
    assert.equal(
      (await request(`/api/community/friends/${aliceId}/accept`, eve, "POST"))
        .status,
      404,
    );
    assert.equal(
      (await request(`/api/community/friends/${bobId}/accept`, alice, "POST"))
        .status,
      404,
    );
    assert.equal(
      (await request(`/api/community/friends/${aliceId}/accept`, bob, "POST"))
        .status,
      200,
    );
    assert.equal(
      (await request("/api/community/matches", alice)).data.matches.length,
      0,
    );
    await request("/api/community/profile", bob, "PUT", {
      name: "Bob",
      matching: true,
    });
    const matches = (await request("/api/community/matches", alice)).data
      .matches;
    assert.equal(matches.length, 1);
    assert.equal(matches[0].score, 100);
    assert.ok(!JSON.stringify(matches).includes("github.com"));
    assert.ok(!JSON.stringify(matches).includes("Private fixture"));
    assert.equal(
      (await request("/api/community/matches", eve)).data.matches.length,
      0,
    );
    await request("/api/community/categories", bob, "PUT", {
      domain: "github.com",
      category: "other",
    });
    assert.equal(
      (await request("/api/community/matches", alice)).data.matches[0].score,
      null,
    );
    await request("/api/community/profile", bob, "PUT", {
      name: "Bob",
      matching: false,
    });
    assert.equal(
      (await request("/api/community/matches", alice)).data.matches.length,
      0,
    );
    await request("/api/community/profile", bob, "PUT", {
      name: "Bob",
      matching: true,
    });
    await request(`/api/community/friends/${bobId}`, alice, "DELETE");
    assert.equal(
      (await request("/api/community/matches", alice)).data.matches.length,
      0,
    );
  } finally {
    db.close();
  }
});

test("share snapshots exclude raw history, are private until explicitly created, expire and can only be revoked by owner", async () => {
  const { db, app, request, create, batch } = fixture();
  try {
    const alice = await create("alice"),
      bob = await create("bob");
    await request("/api/events", alice, "POST", batch);
    await request("/api/community/profile", alice, "PUT", {
      name: "<script>alert(1)</script>",
      matching: false,
    });
    assert.equal((await request("/api/community/shares", "")).status, 401);
    const share = await request("/api/community/shares", alice, "POST", {
      days: 1,
    });
    assert.equal(share.status, 201);
    const html = await (await app.request(share.data.path)).text();
    assert.ok(html.includes("&lt;script&gt;"));
    for (const privateText of [
      "github.com",
      "Private fixture",
      "Fixture",
      "<script>",
    ])
      assert.ok(!html.includes(privateText));
    await request(`/api/community/shares/${share.data.id}`, bob, "DELETE");
    assert.equal((await app.request(share.data.path)).status, 200);
    await request(`/api/community/shares/${share.data.id}`, alice, "DELETE");
    assert.equal((await app.request(share.data.path)).status, 404);
    const expiring = await request("/api/community/shares", alice, "POST", {
      days: 1,
    });
    db.prepare("UPDATE shares SET expires=0 WHERE id=?").run(expiring.data.id);
    assert.equal((await app.request(expiring.data.path)).status, 404);
    const invite = (await request("/api/community/invitations", master, "POST"))
      .data.invitation;
    const body = {
      handle: "charlie",
      name: "Charlie",
      password,
      invitation: invite,
    };
    assert.equal(
      (await request("/auth/register", "", "POST", body)).status,
      201,
    );
    assert.equal(
      (
        await request("/auth/register", "", "POST", {
          ...body,
          handle: "david",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("/auth/register", "", "POST", {
          ...body,
          invitation: "invalid".repeat(8),
        })
      ).status,
      409,
    );
  } finally {
    db.close();
  }
});

test("classifier matches host boundaries and keeps unknown websites unclassified", () => {
  assert.equal(classify("github.com.attacker.test"), "other");
  assert.equal(classify("docs.github.com"), "technology");
  assert.equal(classify("private.internal"), "other");
});

test("public authentication limits request sizes and repeated attempts", async () => {
  const { db, app } = fixture();
  try {
    assert.equal(
      (
        await app.request("/auth/login", {
          method: "POST",
          body: "x".repeat(9000),
        })
      ).status,
      413,
    );
    for (let i = 0; i < 30; i++)
      assert.equal(
        (await app.request("/auth/login", { method: "POST", body: "{}" }))
          .status,
        400,
      );
    const limited = await app.request("/auth/login", {
      method: "POST",
      body: "{}",
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
  } finally {
    db.close();
  }
});
