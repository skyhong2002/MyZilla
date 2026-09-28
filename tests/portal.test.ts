import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/server/app";
import { searchUrl } from "../src/portal/model";
const master = "portal-owner-token-more-than-32-characters";
function setup() {
  const db = new DatabaseSync(":memory:"),
    app = createApp(db, master);
  async function call(
    path: string,
    token = master,
    method = "GET",
    body?: unknown,
  ) {
    const response = await app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  async function member(handle: string) {
    const invitation = (
      await call("/api/community/invitations", master, "POST")
    ).data.invitation;
    return (
      await call("/auth/register", "", "POST", {
        handle,
        name: handle,
        password: "fixture-password-123456",
        invitation,
      })
    ).data.token as string;
  }
  return { db, app, call, member };
}
const bookmark = {
  kind: "bookmark",
  title: "Private <title>",
  url: "https://example.org/private?q=1&x=2",
  scope: "work",
  tags: ["研究"],
  notes: "Only a selected friend may see this",
  visibility: "private",
};
test("portal ownership, unlimited pagination, filters, idempotent import and visit-independent click counts", async () => {
  const { db, call, member } = setup();
  try {
    const alice = await member("alice"),
      bob = await member("bob");
    const ids = Array.from({ length: 23 }, () => randomUUID());
    for (const [i, id] of ids.entries())
      assert.equal(
        (
          await call("/api/portal/items/" + id, alice, "PUT", {
            ...bookmark,
            title: "Book " + i,
          })
        ).status,
        200,
      );
    assert.equal(
      (await call("/api/portal/items/" + ids[0], alice, "PUT", bookmark))
        .status,
      200,
    );
    assert.equal((await call("/api/portal/items", alice)).data.total, 23);
    assert.equal(
      (await call("/api/portal/items?offset=20", alice)).data.items.length,
      3,
    );
    assert.equal(
      (await call("/api/portal/items?scope=home", alice)).data.total,
      0,
    );
    assert.equal(
      (await call("/api/portal/items?q=研究", alice)).data.total,
      23,
    );
    assert.equal((await call("/api/portal/items", bob)).data.total, 0);
    assert.equal(
      (await call("/api/portal/items/" + ids[0] + "/open", bob, "POST")).status,
      404,
    );
    await call("/api/portal/items/" + ids[0], bob, "DELETE");
    assert.equal(
      (await call("/api/portal/items/" + ids[0] + "/open", alice, "POST")).data
        .url,
      bookmark.url,
    );
    assert.equal(
      (await call("/api/portal/items?sort=clicks", alice)).data.items[0].clicks,
      1,
    );
    assert.equal(
      (await call("/api/report?from=0&to=9999999999999", alice)).data
        .visitCount,
      0,
    );
    assert.equal(
      (await call("/api/portal/export", alice)).data.items.length,
      23,
    );
    assert.equal(
      (
        await call("/api/portal/items/" + ids[0], alice, "PUT", {
          ...bookmark,
          url: "javascript:alert(1)",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/api/portal/items/" + ids[0], alice, "PUT", {
          ...bookmark,
          url: "https://user:pass@example.org",
        })
      ).status,
      400,
    );
    const device = (await call("/api/community/device-token", alice, "POST"))
      .data.token;
    assert.equal((await call("/api/portal/export", device)).status, 403);
    assert.equal((await call("/api/portal/items", "")).status, 401);
  } finally {
    db.close();
  }
});
test("friends only see explicitly shared collections, with immediate privacy and relationship revocation", async () => {
  const { db, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      eve = await member("eve");
    const aid = (await call("/api/community/me", a)).data.id,
      bid = (await call("/api/community/me", b)).data.id;
    const id = randomUUID();
    await call("/api/portal/items/" + id, a, "PUT", {
      ...bookmark,
      visibility: "friends",
    });
    assert.equal(
      (await call("/api/portal/items?audience=friends", b)).data.total,
      0,
    );
    await call("/api/community/friends", a, "POST", { handle: "bob" });
    await call("/api/community/friends/" + aid + "/accept", b, "POST");
    assert.equal(
      (await call("/api/portal/items?audience=friends", b)).data.items[0].notes,
      bookmark.notes,
    );
    assert.equal(
      (await call("/api/portal/items?audience=friends", eve)).data.total,
      0,
    );
    await call("/api/portal/items/" + id, a, "PUT", bookmark);
    assert.equal(
      (await call("/api/portal/items?audience=friends", b)).data.total,
      0,
    );
    await call("/api/portal/items/" + id, a, "PUT", {
      ...bookmark,
      visibility: "friends",
    });
    await call("/api/community/friends/" + bid, a, "DELETE");
    assert.equal(
      (await call("/api/portal/items?audience=friends", b)).data.total,
      0,
    );
  } finally {
    db.close();
  }
});
test("short links use validated destinations, track opens, update targets, expire and revoke without disclosing notes", async () => {
  const { db, app, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      id = randomUUID();
    await call("/api/portal/items/" + id, a, "PUT", bookmark);
    assert.equal(
      (await call("/api/portal/items/" + id + "/link", b, "POST", { days: 7 }))
        .status,
      404,
    );
    const link = (
      await call("/api/portal/items/" + id + "/link", a, "POST", { days: 7 })
    ).data;
    const first = await app.request(link.path);
    assert.equal(first.status, 302);
    assert.equal(first.headers.get("location"), bookmark.url);
    assert.ok(!(await first.text()).includes(bookmark.notes));
    assert.equal((await call("/api/portal/links", a)).data.links[0].clicks, 1);
    await call("/api/portal/items/" + id, a, "PUT", {
      ...bookmark,
      url: "https://example.net/new",
    });
    assert.equal(
      (await app.request(link.path)).headers.get("location"),
      "https://example.net/new",
    );
    await call("/api/portal/links/" + link.id, b, "DELETE");
    assert.equal((await app.request(link.path)).status, 302);
    await call("/api/portal/links/" + link.id, a, "DELETE");
    assert.equal((await app.request(link.path)).status, 404);
    const expired = (
      await call("/api/portal/items/" + id + "/link", a, "POST", { days: 1 })
    ).data;
    db.prepare("UPDATE portal_links SET expires=0 WHERE id=?").run(expired.id);
    assert.equal((await app.request(expired.path)).status, 404);
    const deleted = (
      await call("/api/portal/items/" + id + "/link", a, "POST", { days: 1 })
    ).data;
    await call("/api/portal/items/" + id, a, "DELETE");
    assert.equal((await app.request(deleted.path)).status, 404);
  } finally {
    db.close();
  }
});
test("search records, movie collections, moods, authenticated RSS and opt-in presence remain account scoped", async () => {
  const { db, app, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob");
    for (let i = 0; i < 2; i++)
      await call("/api/portal/search", a, "POST", {
        engine: "google",
        query: "a & b",
      });
    assert.equal((await call("/api/portal/searches", a)).data.items[0].uses, 2);
    assert.equal((await call("/api/portal/searches", b)).data.total, 0);
    assert.equal(
      new URL(searchUrl("google", "a & b")).searchParams.get("q"),
      "a & b",
    );
    const id = randomUUID();
    await call("/api/portal/items/" + id, a, "PUT", {
      ...bookmark,
      kind: "movie",
      rating: 9,
      watched: 2,
      wishlist: true,
      collection: "DVD",
    });
    const movie = (await call("/api/portal/items?kind=movie", a)).data.items[0];
    assert.equal(movie.watched, 2);
    assert.equal(movie.collection, "DVD");
    await call("/api/portal/items/" + randomUUID(), a, "PUT", {
      kind: "mood",
      title: "Today",
      mood: "calm",
    });
    assert.equal((await call("/api/portal/items?kind=mood", a)).data.total, 1);
    await call("/api/portal/items/" + randomUUID(), a, "PUT", bookmark);
    const feed = await app.request("/api/portal/feed", {
      headers: { authorization: `Bearer ${a}` },
    });
    assert.equal(feed.status, 200);
    const text = await feed.text();
    assert.ok(text.includes("&lt;title&gt;"));
    assert.ok(text.includes("&amp;x=2"));
    assert.equal((await app.request("/api/portal/feed")).status, 401);
    await call("/api/portal/me", a);
    assert.equal((await call("/api/portal/online", b)).data.users.length, 0);
    await call("/api/portal/preferences", a, "PUT", { online: true });
    assert.equal(
      (await call("/api/portal/online", b)).data.users[0].handle,
      "alice",
    );
    await call("/api/portal/preferences", a, "PUT", { online: false });
    assert.equal((await call("/api/portal/online", b)).data.users.length, 0);
  } finally {
    db.close();
  }
});

test("movie comparison uses only own and explicitly shared friend entries, one rating per person", async () => {
  const { db, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      eve = await member("eve");
    const aid = (await call("/api/community/me", a)).data.id;
    const movie = {
        ...bookmark,
        kind: "movie",
        rating: 9,
        watched: 2,
        wishlist: true,
        collection: "DVD",
      },
      id = randomUUID();
    await call("/api/portal/items/" + id, a, "PUT", movie);
    await call("/api/portal/items/" + randomUUID(), eve, "PUT", {
      ...movie,
      rating: 1,
      visibility: "friends",
    });
    await call("/api/community/friends", a, "POST", { handle: "bob" });
    await call("/api/community/friends/" + aid + "/accept", b, "POST");
    const bid = randomUUID();
    await call("/api/portal/items/" + bid, b, "PUT", { ...movie, rating: 7 });
    assert.equal(
      (await call("/api/portal/items/" + id + "/movie-summary", a)).data
        .average,
      9,
    );
    await call("/api/portal/items/" + bid, b, "PUT", {
      ...movie,
      rating: 7,
      visibility: "friends",
    });
    const summary = (
      await call("/api/portal/items/" + id + "/movie-summary", a)
    ).data;
    assert.equal(summary.average, 8);
    assert.equal(summary.people, 2);
    assert.equal(summary.watchedTotal, 4);
    assert.equal(
      (await call("/api/portal/items/" + id + "/movie-summary", b)).status,
      404,
    );
  } finally {
    db.close();
  }
});

test("deleted collections restore metadata once within ten minutes, without reviving links or crossing accounts", async () => {
  const { db, app, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      id = randomUUID();
    await call("/api/portal/items/" + id, a, "PUT", bookmark);
    await call("/api/portal/items/" + id + "/open", a, "POST");
    const original = (await call("/api/portal/items", a)).data.items[0];
    const link = (
      await call("/api/portal/items/" + id + "/link", a, "POST", { days: 7 })
    ).data;
    await call("/api/portal/items/" + id, a, "DELETE");
    assert.equal((await call("/api/portal/items", a)).data.total, 0);
    assert.equal((await call("/api/portal/trash", a)).data.items[0].id, id);
    assert.equal((await call("/api/portal/trash", b)).data.items.length, 0);
    assert.equal((await call("/api/portal/trash", "")).status, 401);
    assert.equal(
      (await call("/api/portal/trash/" + id + "/restore", b, "POST")).status,
      404,
    );
    assert.equal(
      (await call("/api/portal/trash/" + id + "/restore", "", "POST")).status,
      401,
    );
    assert.equal(
      (await call("/api/portal/trash/" + id + "/restore", a, "POST")).status,
      200,
    );
    assert.deepEqual(
      (await call("/api/portal/items", a)).data.items[0],
      original,
    );
    assert.equal((await app.request(link.path)).status, 404);
    assert.equal(
      (await call("/api/portal/trash/" + id + "/restore", a, "POST")).status,
      404,
    );
    await call("/api/portal/items/" + id, a, "DELETE");
    await call("/api/portal/items/" + id, a, "PUT", {
      ...bookmark,
      title: "new content",
    });
    assert.equal(
      (await call("/api/portal/trash/" + id + "/restore", a, "POST")).status,
      409,
    );
    assert.equal(
      (await call("/api/portal/items", a)).data.items[0].title,
      "new content",
    );
    await call("/api/portal/items/" + id, a, "DELETE");
    db.prepare("UPDATE portal_trash SET expires=0").run();
    assert.equal(
      (await call("/api/portal/trash/" + id + "/restore", a, "POST")).status,
      404,
    );
  } finally {
    db.close();
  }
});
