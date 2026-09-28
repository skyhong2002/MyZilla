import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/server/app";
const master = "curation-test-owner-".repeat(3);
function setup() {
  const db = new DatabaseSync(":memory:"),
    app = createApp(db, master);
  const call = async (
    path: string,
    token = master,
    method = "GET",
    body?: unknown,
  ) => {
    const r = await app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  const member = async (handle: string) => {
    const invitation = (
      await call("/api/community/invitations", master, "POST")
    ).data.invitation;
    const token = (
      await call("/auth/register", "", "POST", {
        handle,
        name: handle,
        password: "curation-password-12345",
        invitation,
      })
    ).data.token;
    return { token, id: (await call("/api/community/me", token)).data.id };
  };
  return { db, app, call, member };
}
const item = {
  url: "https://example.org/reading?q=1",
  title: "值得看的 <script>內容</script>",
  note: "我的推薦理由",
};
test("inbox accounts for all rows, deduplicates per owner and preserves decisions on replay", async () => {
  const { db, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob");
    const capture = await call("/api/curation/capture", a.token, "POST", {
      items: [item, item, { ...item, url: "file:///private" }],
    });
    assert.deepEqual(
      [
        capture.data.accepted,
        capture.data.inserted,
        capture.data.duplicates,
        capture.data.rejected,
      ],
      [2, 1, 1, 1],
    );
    assert.equal(capture.data.rejections[0].index, 2);
    const rows = (await call("/api/curation/inbox", a.token)).data;
    assert.equal(rows.total, 1);
    assert.equal((await call("/api/curation/inbox", b.token)).data.total, 0);
    assert.equal(
      (
        await call(
          "/api/curation/inbox/" + rows.items[0].id,
          b.token,
          "PATCH",
          { status: "dismissed" },
        )
      ).status,
      404,
    );
    await call("/api/curation/inbox/" + rows.items[0].id, a.token, "PATCH", {
      status: "dismissed",
    });
    await call("/api/curation/capture", a.token, "POST", { items: [item] });
    assert.equal((await call("/api/curation/inbox", a.token)).data.total, 0);
    assert.equal(
      (await call("/api/curation/inbox?status=dismissed", a.token)).data.total,
      1,
    );
    await call("/api/curation/capture", a.token, "POST", {
      items: Array.from({ length: 45 }, (_, i) => ({
        ...item,
        url: `https://example.org/${i}`,
      })),
    });
    assert.equal(
      (await call("/api/curation/inbox?offset=40", a.token)).data.items.length,
      5,
    );
    const device = (await call("/api/community/device-token", a.token, "POST"))
      .data.token;
    assert.equal(
      (await call("/api/curation/capture", device, "POST", { items: [item] }))
        .status,
      200,
    );
    for (const path of ["inbox", "collections"]) {
      assert.equal((await call("/api/curation/" + path, device)).status, 403);
      assert.equal((await call("/api/curation/" + path, "")).status, 401);
    }
  } finally {
    db.close();
  }
});
test("selected collections connect private inbox, collaborators and revocable public snapshots without exposing history", async () => {
  const { db, app, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      eve = await member("eve"),
      id = randomUUID(),
      path = "/api/curation/collections/" + id;
    await call("/api/curation/capture", a.token, "POST", { items: [item] });
    assert.equal(
      (await call(path, a.token, "PUT", { title: "閱讀選集", tags: ["研究"] }))
        .status,
      200,
    );
    assert.equal(
      (await call(path, a.token, "PUT", { title: "閱讀選集", tags: ["研究"] }))
        .status,
      200,
    );
    assert.equal((await call(path, b.token)).status, 404);
    const put = await call(path + "/items", a.token, "POST", { items: [item] });
    assert.equal(put.data.inserted, 1);
    assert.equal(
      (await call("/api/curation/inbox?status=kept", a.token)).data.total,
      1,
    );
    assert.equal(
      (await call(path + "/items", a.token, "POST", { items: [item] })).data
        .duplicates,
      1,
    );
    await call("/api/community/friends", a.token, "POST", { handle: "bob" });
    await call("/api/community/friends/" + a.id + "/accept", b.token, "POST");
    assert.equal(
      (await call(path + "/members/" + b.id, a.token, "PUT")).status,
      200,
    );
    assert.equal(
      (await call(path + "/members/" + eve.id, a.token, "PUT")).status,
      400,
    );
    assert.equal((await call(path, b.token)).data.role, "editor");
    assert.equal(
      (
        await call(path + "/items", b.token, "POST", {
          items: [{ ...item, url: "https://example.net/two", title: "second" }],
        })
      ).data.inserted,
      1,
    );
    assert.equal((await call(path, eve.token)).status, 404);
    const current = (await call(path, a.token)).data;
    assert.equal(
      (
        await call(path + "/share", b.token, "POST", {
          days: 7,
          revision: current.revision,
        })
      ).status,
      403,
    );
    const share = (
      await call(path + "/share", a.token, "POST", {
        days: 7,
        revision: current.revision,
      })
    ).data;
    const html = await (await app.request(share.path)).text();
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes(a.id));
    assert.ok(!html.includes("visitedAt"));
    assert.ok(html.includes("我的推薦理由"));
    await call(path + "/items", a.token, "POST", {
      items: [
        { ...item, url: "https://example.net/three", title: "later-private" },
      ],
    });
    assert.ok(
      !(await (await app.request(share.path)).text()).includes("later-private"),
    );
    assert.equal(
      (
        await call(path + "/items/" + current.items[0].id, b.token, "PATCH", {
          title: "overwrite",
          note: "stale",
          revision: current.revision,
        })
      ).status,
      409,
    );
    await call("/api/community/friends/" + b.id, a.token, "DELETE");
    assert.equal((await call(path, b.token)).status, 404);
    assert.equal(
      (await call(path + "/items", b.token, "POST", { items: [item] })).status,
      403,
    );
    await call(path + "/shares/" + share.id, a.token, "DELETE");
    assert.equal((await app.request(share.path)).status, 404);
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) n FROM events").get()!.n),
      0,
    );
  } finally {
    db.close();
  }
});
test("friends visibility is explicit; stable ordering rejects partial lists and concurrent changes", async () => {
  const { db, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      id = randomUUID(),
      path = "/api/curation/collections/" + id;
    await call(path, a.token, "PUT", { title: "選集" });
    await call(path + "/items", a.token, "POST", {
      items: [item, { ...item, url: "https://example.net/2" }],
    });
    await call("/api/community/friends", a.token, "POST", { handle: "bob" });
    await call("/api/community/friends/" + a.id + "/accept", b.token, "POST");
    assert.equal(
      (await call("/api/curation/collections?audience=friends", b.token)).data
        .total,
      0,
    );
    let d = (await call(path, a.token)).data;
    await call(path, a.token, "PUT", {
      title: "選集",
      visibility: "friends",
      revision: d.revision,
    });
    assert.equal(
      (await call("/api/curation/collections?audience=friends", b.token)).data
        .total,
      1,
    );
    assert.equal(
      (await call(path + "/items", b.token, "POST", { items: [item] })).status,
      403,
    );
    d = (await call(path, a.token)).data;
    const ids = d.items.map((r: any) => r.id).reverse();
    assert.equal(
      (
        await call(path + "/order", a.token, "POST", {
          ids: [ids[0]],
          revision: d.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call(path + "/order", a.token, "POST", {
          ids,
          revision: d.revision,
        })
      ).status,
      200,
    );
    assert.deepEqual(
      (await call(path, a.token)).data.items.map((r: any) => r.id),
      ids,
    );
    assert.equal(
      (
        await call(path, a.token, "PUT", {
          title: "stale",
          revision: d.revision,
        })
      ).status,
      409,
    );
    d = (await call(path, a.token)).data;
    await call(path, a.token, "PUT", {
      title: d.title,
      visibility: "private",
      revision: d.revision,
    });
    assert.equal((await call(path, b.token)).status, 404);
  } finally {
    db.close();
  }
});

test("archiving revokes collaboration and public links, restoring retains all content privately", async () => {
  const { db, app, call, member } = setup();
  try {
    const a = await member("alice"),
      b = await member("bob"),
      id = randomUUID(),
      path = "/api/curation/collections/" + id;
    await call(path, a.token, "PUT", {
      title: "archive me",
      visibility: "friends",
    });
    await call(path + "/items", a.token, "POST", { items: [item] });
    await call("/api/community/friends", a.token, "POST", { handle: "bob" });
    await call("/api/community/friends/" + a.id + "/accept", b.token, "POST");
    await call(path + "/members/" + b.id, a.token, "PUT");
    const d = (await call(path, a.token)).data;
    const share = (
      await call(path + "/share", a.token, "POST", {
        days: 7,
        revision: d.revision,
      })
    ).data;
    assert.equal(
      (await call(path + "?revision=" + d.revision, b.token, "DELETE")).status,
      403,
    );
    assert.equal(
      (await call(path + "?revision=" + d.revision, a.token, "DELETE")).status,
      200,
    );
    assert.equal((await app.request(share.path)).status, 404);
    assert.equal((await call(path, b.token)).status, 404);
    assert.equal(
      (await call("/api/curation/collections", a.token)).data.total,
      0,
    );
    assert.equal(
      (await call("/api/curation/collections?audience=archived", a.token)).data
        .total,
      1,
    );
    await call(path + "/restore", a.token, "POST");
    const restored = (await call(path, a.token)).data;
    assert.equal(restored.visibility, "private");
    assert.equal(restored.items.length, 1);
    assert.equal(restored.members.length, 0);
    assert.equal((await call(path, b.token)).status, 404);
  } finally {
    db.close();
  }
});
