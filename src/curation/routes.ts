import type { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { Registry, digest, secret } from "../accounts/registry";
import { webUrl } from "../shared/model";
import { xml } from "../portal/model";

const pageSchema = z.object({
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  q: z.string().max(2000).default(""),
});
const resource = z.object({
  url: z
    .string()
    .max(8000)
    .refine((v) => !!webUrl(v), "請填寫不含帳密的 HTTP/HTTPS 網址"),
  title: z.string().trim().min(1).max(500),
  note: z.string().max(10000).default(""),
});
const metadata = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).default(""),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  visibility: z.enum(["private", "friends"]).default("private"),
});
const revision = z.number().int().positive();
type Collection = {
  id: string;
  account: string;
  title: string;
  description: string;
  tags: string;
  visibility: string;
  revision: number;
  updated: number;
  created: number;
};
export function registerCuration(app: Hono, registry: Registry) {
  const db = registry.db;
  db.exec(`CREATE TABLE IF NOT EXISTS curation_inbox(account TEXT NOT NULL,id TEXT NOT NULL,url TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(account,id),UNIQUE(account,url));
  CREATE TABLE IF NOT EXISTS curation_collections(id TEXT PRIMARY KEY,account TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,tags TEXT NOT NULL,visibility TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS curation_owner ON curation_collections(account,updated);
  CREATE TABLE IF NOT EXISTS curation_members(collection TEXT NOT NULL,account TEXT NOT NULL,PRIMARY KEY(collection,account));
  CREATE TABLE IF NOT EXISTS curation_entries(id TEXT PRIMARY KEY,collection TEXT NOT NULL,url TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,contributor TEXT NOT NULL,position INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(collection,url));
  CREATE INDEX IF NOT EXISTS curation_order ON curation_entries(collection,position);
  CREATE TABLE IF NOT EXISTS curation_shares(id TEXT PRIMARY KEY,collection TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,snapshot TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL);`);
  db.exec(
    "CREATE TABLE IF NOT EXISTS curation_archives(collection TEXT PRIMARY KEY,archived INTEGER NOT NULL)",
  );
  app.use(
    "/api/curation/*",
    bodyLimit({
      maxSize: 512 * 1024,
      onError: (c) => c.json({ error: "內容過大，請分批加入" }, 413),
    }),
  );
  app.use("/api/curation/*", async (c, next) => {
    // A sync key can deliver explicitly selected pages, but cannot read or share private collections.
    if (
      c.get("account").credential === "device" &&
      !(c.req.method === "POST" && c.req.path === "/api/curation/capture")
    )
      return c.json({ error: "請以帳號登入整理與分享" }, 403);
    await next();
  });
  const friends = (a: string, b: string) =>
    !!db
      .prepare(
        "SELECT 1 FROM friendships WHERE status='accepted' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?))",
      )
      .get(a, b, b, a);
  const get = (id: string) =>
    db.prepare("SELECT * FROM curation_collections WHERE id=?").get(id) as
      Collection | undefined;
  const archived = (id: string) =>
    !!db.prepare("SELECT 1 FROM curation_archives WHERE collection=?").get(id);
  const role = (row: Collection, account: string) =>
    archived(row.id)
      ? null
      : row.account === account
        ? "owner"
        : friends(row.account, account)
          ? db
              .prepare(
                "SELECT 1 FROM curation_members WHERE collection=? AND account=?",
              )
              .get(row.id, account)
            ? "editor"
            : row.visibility === "friends"
              ? "reader"
              : null
          : null;
  const entries = (id: string) =>
    db
      .prepare(
        "SELECT id,url,title,note,contributor,position FROM curation_entries WHERE collection=? ORDER BY position,id",
      )
      .all(id);
  const display = (row: Collection, account: string) => ({
    ...row,
    tags: JSON.parse(row.tags),
    role: row.account === account ? "owner" : role(row, account),
    archived: archived(row.id),
    owner: registry.account(row.account)?.name,
    count: db
      .prepare("SELECT COUNT(*) AS n FROM curation_entries WHERE collection=?")
      .get(row.id)!.n,
  });
  const bump = (id: string) =>
    db
      .prepare(
        "UPDATE curation_collections SET revision=revision+1,updated=? WHERE id=?",
      )
      .run(Date.now(), id);
  const transaction = <T>(job: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = job();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const conflict = {
    error: "這份選集剛被更新。請重新載入確認最新內容，再送出；你的輸入仍保留。",
  };
  const capture = (account: string, items: z.infer<typeof resource>[]) =>
    transaction(() => {
      let inserted = 0;
      for (const item of items) {
        const url = webUrl(item.url)!;
        inserted += Number(
          db
            .prepare(
              "INSERT OR IGNORE INTO curation_inbox VALUES(?,?,?,?,?,'pending',?,?)",
            )
            .run(
              account,
              digest(url),
              url,
              item.title,
              item.note,
              Date.now(),
              Date.now(),
            ).changes,
        );
      }
      return {
        accepted: items.length,
        inserted,
        duplicates: items.length - inserted,
        rejected: 0,
      };
    });
  app.post("/api/curation/capture", async (c) => {
    const input = z
      .object({ items: z.array(z.unknown()).min(1).max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "每批請提供 1–200 筆連結" }, 400);
    const valid: z.infer<typeof resource>[] = [];
    const rejections: { index: number; reason: string }[] = [];
    input.data.items.forEach((v, index) => {
      const p = resource.safeParse(v);
      if (p.success) valid.push(p.data);
      else
        rejections.push({
          index,
          reason: p.error.issues.map((i) => i.message).join("；"),
        });
    });
    return c.json({
      ...capture(c.get("account").id, valid),
      rejected: rejections.length,
      rejections,
    });
  });
  app.get("/api/curation/inbox", (c) => {
    const p = pageSchema
      .extend({
        status: z.enum(["pending", "kept", "dismissed"]).default("pending"),
      })
      .safeParse(c.req.query());
    if (!p.success) return c.json({ error: "查詢格式錯誤" }, 400);
    const { offset, q, status } = p.data,
      account = c.get("account").id;
    const where =
      "account=? AND status=? AND (?='' OR instr(lower(title||url||note),lower(?))>0)";
    const args = [account, status, q, q];
    return c.json({
      total: db
        .prepare(`SELECT COUNT(*) AS n FROM curation_inbox WHERE ${where}`)
        .get(...args)!.n,
      offset,
      limit: 20,
      items: db
        .prepare(
          `SELECT * FROM curation_inbox WHERE ${where} ORDER BY updated DESC,id LIMIT 20 OFFSET ?`,
        )
        .all(...args, offset),
    });
  });
  app.patch("/api/curation/inbox/:id", async (c) => {
    const input = z
      .object({ status: z.enum(["pending", "kept", "dismissed"]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "整理狀態無效" }, 400);
    const result = db
      .prepare(
        "UPDATE curation_inbox SET status=?,updated=? WHERE account=? AND id=?",
      )
      .run(
        input.data.status,
        Date.now(),
        c.get("account").id,
        c.req.param("id"),
      );
    return result.changes
      ? c.json({ ok: true })
      : c.json({ error: "找不到此待整理項目" }, 404);
  });
  app.get("/api/curation/collections", (c) => {
    const p = pageSchema
      .extend({
        audience: z
          .enum(["mine", "friends", "editable", "archived"])
          .default("mine"),
        owner: z.string().max(100).optional(),
      })
      .safeParse(c.req.query());
    if (!p.success) return c.json({ error: "查詢格式錯誤" }, 400);
    const account = c.get("account").id,
      { q, offset, audience, owner } = p.data;
    const rows = (
      db
        .prepare(
          "SELECT * FROM curation_collections WHERE instr(lower(title||description||tags),lower(?))>0 ORDER BY updated DESC,id",
        )
        .all(q) as Collection[]
    ).filter((row) => {
      if (audience === "archived")
        return row.account === account && archived(row.id);
      const r = role(row, account);
      return (
        r &&
        (!owner || row.account === owner) &&
        (audience === "editable"
          ? r !== "reader"
          : audience === "mine"
            ? r === "owner" || r === "editor"
            : row.account !== account)
      );
    });
    return c.json({
      total: rows.length,
      offset,
      limit: 20,
      items: rows.slice(offset, offset + 20).map((r) => display(r, account)),
    });
  });
  app.put("/api/curation/collections/:id", async (c) => {
    if (!z.uuid().safeParse(c.req.param("id")).success)
      return c.json({ error: "選集 ID 無效" }, 400);
    const input = metadata
      .extend({ revision: revision.optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "請填寫選集名稱，並確認介紹與標籤長度" }, 400);
    const id = c.req.param("id"),
      account = c.get("account").id,
      row = get(id),
      v = input.data;
    if (row && archived(row.id))
      return c.json({ error: "請先復原封存的選集" }, 409);
    if (row && row.account !== account)
      return c.json({ error: "只有建立者能修改選集設定" }, 403);
    if (
      row &&
      v.revision === undefined &&
      row.revision === 1 &&
      row.title === v.title &&
      row.description === v.description &&
      row.tags === JSON.stringify([...new Set(v.tags)]) &&
      row.visibility === v.visibility
    )
      return c.json(display(row, account));
    if (row && row.revision !== v.revision) return c.json(conflict, 409);
    const now = Date.now();
    if (row)
      db.prepare(
        "UPDATE curation_collections SET title=?,description=?,tags=?,visibility=?,revision=revision+1,updated=? WHERE id=?",
      ).run(
        v.title,
        v.description,
        JSON.stringify([...new Set(v.tags)]),
        v.visibility,
        now,
        id,
      );
    else
      db.prepare(
        "INSERT INTO curation_collections VALUES(?,?,?,?,?,?,1,?,?)",
      ).run(
        id,
        account,
        v.title,
        v.description,
        JSON.stringify([...new Set(v.tags)]),
        v.visibility,
        now,
        now,
      );
    return c.json(display(get(id)!, account));
  });
  app.get("/api/curation/collections/:id", (c) => {
    const row = get(c.req.param("id")),
      account = c.get("account").id;
    if (!row || !role(row, account))
      return c.json({ error: "找不到選集，或你已沒有查看權限" }, 404);
    const r = role(row, account);
    return c.json({
      ...display(row, account),
      items: entries(row.id),
      members:
        r === "owner"
          ? db
              .prepare(
                "SELECT a.id,a.name,a.handle FROM curation_members m JOIN accounts a ON m.account=a.id WHERE m.collection=?",
              )
              .all(row.id)
          : [],
      shares:
        r === "owner"
          ? db
              .prepare(
                "SELECT id,expires,created FROM curation_shares WHERE collection=? AND expires>? ORDER BY created DESC",
              )
              .all(row.id, Date.now())
          : [],
    });
  });
  app.post("/api/curation/collections/:id/items", async (c) => {
    const input = z
      .object({ items: z.array(resource).min(1).max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "請檢查網址與標題；每批最多加入 200 筆" }, 400);
    const row = get(c.req.param("id")),
      account = c.get("account").id;
    if (!row || !["owner", "editor"].includes(role(row, account) ?? ""))
      return c.json({ error: "沒有加入此選集的權限" }, 403);
    const value = transaction(() => {
      let position =
          Number(
            db
              .prepare(
                "SELECT coalesce(max(position),-1) AS n FROM curation_entries WHERE collection=?",
              )
              .get(row.id)!.n,
          ) + 1,
        inserted = 0;
      for (const v of input.data.items) {
        const url = webUrl(v.url)!;
        inserted += Number(
          db
            .prepare(
              "INSERT OR IGNORE INTO curation_entries VALUES(?,?,?,?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              row.id,
              url,
              v.title,
              v.note,
              account,
              position++,
              Date.now(),
            ).changes,
        );
        db.prepare(
          "UPDATE curation_inbox SET status='kept',updated=? WHERE account=? AND url=?",
        ).run(Date.now(), account, url);
      }
      if (inserted) bump(row.id);
      return {
        accepted: input.data.items.length,
        inserted,
        duplicates: input.data.items.length - inserted,
        rejected: 0,
      };
    });
    return c.json(value);
  });
  app.patch("/api/curation/collections/:id/items/:item", async (c) => {
    const p = z
      .object({
        title: z.string().trim().min(1).max(500),
        note: z.string().max(10000),
        revision,
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "請檢查標題與推薦理由" }, 400);
    const row = get(c.req.param("id")),
      account = c.get("account").id;
    if (!row || !["owner", "editor"].includes(role(row, account) ?? ""))
      return c.json({ error: "沒有編輯權限" }, 403);
    if (p.data.revision !== row.revision) return c.json(conflict, 409);
    const changed = transaction(() => {
      const r = db
        .prepare(
          "UPDATE curation_entries SET title=?,note=? WHERE collection=? AND id=?",
        )
        .run(p.data.title, p.data.note, row.id, c.req.param("item"));
      if (r.changes) bump(row.id);
      return r.changes;
    });
    return changed
      ? c.json({ ok: true })
      : c.json({ error: "此項目已移除" }, 404);
  });
  app.post("/api/curation/collections/:id/order", async (c) => {
    const p = z
      .object({ ids: z.array(z.uuid()), revision })
      .safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "排序格式錯誤" }, 400);
    const row = get(c.req.param("id")),
      account = c.get("account").id;
    if (!row || !["owner", "editor"].includes(role(row, account) ?? ""))
      return c.json({ error: "沒有編輯權限" }, 403);
    if (p.data.revision !== row.revision) return c.json(conflict, 409);
    const ids = entries(row.id).map((e) => e.id);
    if (
      ids.length !== p.data.ids.length ||
      new Set(p.data.ids).size !== ids.length ||
      p.data.ids.some((id) => !ids.includes(id))
    )
      return c.json({ error: "請重新載入完整選集後排序" }, 409);
    transaction(() => {
      p.data.ids.forEach((id, index) =>
        db
          .prepare(
            "UPDATE curation_entries SET position=? WHERE collection=? AND id=?",
          )
          .run(index, row.id, id),
      );
      bump(row.id);
    });
    return c.json({ ok: true });
  });
  app.delete("/api/curation/collections/:id/items/:item", (c) => {
    const row = get(c.req.param("id")),
      account = c.get("account").id;
    if (!row || !["owner", "editor"].includes(role(row, account) ?? ""))
      return c.json({ error: "沒有編輯權限" }, 403);
    if (Number(c.req.query("revision")) !== row.revision)
      return c.json(conflict, 409);
    transaction(() => {
      db.prepare(
        "DELETE FROM curation_entries WHERE collection=? AND id=?",
      ).run(row.id, c.req.param("item"));
      bump(row.id);
    });
    return c.json({ ok: true });
  });
  app.put("/api/curation/collections/:id/members/:account", (c) => {
    const row = get(c.req.param("id")),
      other = c.req.param("account");
    if (!row || archived(row.id) || row.account !== c.get("account").id)
      return c.json({ error: "只有建立者能邀請共同編輯" }, 403);
    if (!friends(row.account, other))
      return c.json({ error: "請先成為朋友，再邀請共同編輯" }, 400);
    db.prepare("INSERT OR IGNORE INTO curation_members VALUES(?,?)").run(
      row.id,
      other,
    );
    return c.json({ ok: true });
  });
  app.delete("/api/curation/collections/:id/members/:account", (c) => {
    const row = get(c.req.param("id")),
      account = c.get("account").id,
      other = c.req.param("account");
    if (!row || (row.account !== account && other !== account))
      return c.json({ error: "沒有移除成員的權限" }, 403);
    db.prepare(
      "DELETE FROM curation_members WHERE collection=? AND account=?",
    ).run(row.id, other);
    return c.json({ ok: true });
  });
  app.post("/api/curation/collections/:id/share", async (c) => {
    const p = z
      .object({
        days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
        revision,
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "請選擇有效期" }, 400);
    const row = get(c.req.param("id"));
    if (!row || archived(row.id) || row.account !== c.get("account").id)
      return c.json({ error: "只有建立者能發布選集" }, 403);
    if (p.data.revision !== row.revision) return c.json(conflict, 409);
    const items = entries(row.id).map(({ url, title, note }) => ({
      url,
      title,
      note,
    }));
    if (!items.length)
      return c.json({ error: "先挑選內容，再建立分享連結" }, 400);
    const snapshot = {
      title: row.title,
      description: row.description,
      tags: JSON.parse(row.tags),
      items,
    };
    const token = secret(),
      id = randomUUID(),
      now = Date.now(),
      expires = now + p.data.days * 86400000;
    db.prepare("INSERT INTO curation_shares VALUES(?,?,?,?,?,?)").run(
      id,
      row.id,
      digest(token),
      JSON.stringify(snapshot),
      expires,
      now,
    );
    return c.json({ id, path: `/collection/${token}`, expires }, 201);
  });
  app.delete("/api/curation/collections/:id/shares/:share", (c) => {
    const row = get(c.req.param("id"));
    if (!row || row.account !== c.get("account").id)
      return c.json({ error: "沒有撤銷權限" }, 403);
    db.prepare("DELETE FROM curation_shares WHERE collection=? AND id=?").run(
      row.id,
      c.req.param("share"),
    );
    return c.json({ ok: true });
  });
  app.delete("/api/curation/collections/:id", (c) => {
    const row = get(c.req.param("id"));
    if (!row || row.account !== c.get("account").id)
      return c.json({ error: "只有建立者能封存選集" }, 403);
    if (Number(c.req.query("revision")) !== row.revision)
      return c.json(conflict, 409);
    transaction(() => {
      db.prepare("INSERT OR REPLACE INTO curation_archives VALUES(?,?)").run(
        row.id,
        Date.now(),
      );
      db.prepare("DELETE FROM curation_shares WHERE collection=?").run(row.id);
      db.prepare("DELETE FROM curation_members WHERE collection=?").run(row.id);
      db.prepare(
        "UPDATE curation_collections SET visibility='private' WHERE id=?",
      ).run(row.id);
      bump(row.id);
    });
    return c.json({ ok: true });
  });
  app.post("/api/curation/collections/:id/restore", (c) => {
    const row = get(c.req.param("id"));
    if (!row || row.account !== c.get("account").id)
      return c.json({ error: "找不到可復原的選集" }, 404);
    db.prepare("DELETE FROM curation_archives WHERE collection=?").run(row.id);
    return c.json({ ok: true });
  });
  app.get("/collection/:token", (c) => {
    c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
    const row = db
      .prepare(
        "SELECT snapshot FROM curation_shares WHERE hash=? AND expires>?",
      )
      .get(digest(c.req.param("token")), Date.now());
    if (!row) return c.text("這份分享已到期或已撤銷。", 404);
    const s = JSON.parse(row.snapshot as string);
    return c.html(
      `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${xml(s.title)} · MyZilla</title><style>body{font:17px/1.8 system-ui;background:#f3f6fd;color:#253d4e;max-width:780px;margin:auto;padding:32px 20px}a{color:#245f85;overflow-wrap:anywhere}article{background:white;border:1px solid #c2d3df;border-radius:12px;padding:22px;margin:18px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#627580}</style><a href="/">MyZilla</a><h1>${xml(s.title)}</h1><p>${xml(s.description)}</p><small>${s.tags.map(xml).join(" · ")} · ${s.items.length} 個連結</small>${s.items.map((v: any, i: number) => `<article><small>${i + 1}</small><h2><a href="${xml(v.url)}" target="_blank" rel="noopener noreferrer">${xml(v.title)}</a></h2><p>${xml(v.note)}</p></article>`).join("")}<p><small>這是建立者選擇發布的選集快照。</small></p></html>`,
    );
  });
}
