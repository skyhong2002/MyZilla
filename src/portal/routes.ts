import type { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { Registry, digest, secret } from "../accounts/registry";
import { webUrl } from "../shared/model";
import { itemSchema, engines, searchUrl, xml } from "./model";
export function registerPortal(app: Hono, registry: Registry) {
  const db = registry.db;
  db.exec(`CREATE TABLE IF NOT EXISTS portal_items(account TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,scope TEXT NOT NULL,visibility TEXT NOT NULL,data TEXT NOT NULL,clicks INTEGER NOT NULL DEFAULT 0,last_used INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(account,id));
 CREATE INDEX IF NOT EXISTS portal_owner_kind ON portal_items(account,kind,scope);
 CREATE TABLE IF NOT EXISTS portal_searches(account TEXT NOT NULL,id TEXT NOT NULL,engine TEXT NOT NULL,query TEXT NOT NULL,uses INTEGER NOT NULL,last_used INTEGER NOT NULL,PRIMARY KEY(account,id),UNIQUE(account,engine,query));
 CREATE TABLE IF NOT EXISTS portal_preferences(account TEXT PRIMARY KEY,online INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS portal_links(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,account TEXT NOT NULL,item TEXT NOT NULL,expires INTEGER NOT NULL,clicks INTEGER NOT NULL DEFAULT 0);`);
  app.use(
    "/api/portal/*",
    bodyLimit({
      maxSize: 128 * 1024,
      onError: (c) => c.json({ error: "請求內容過大" }, 413),
    }),
  );
  app.use("/api/portal/*", async (c, next) => {
    if (c.get("account").credential === "device")
      return c.json({ error: "請使用帳號登入入口功能" }, 403);
    await next();
  });
  const decode = (row: any) => ({
    id: row.id,
    ...JSON.parse(row.data),
    clicks: Number(row.clicks),
    lastUsed: Number(row.last_used),
    created: Number(row.created),
    updated: Number(row.updated),
  });
  app.get("/api/portal/me", (c) => {
    const id = c.get("account").id;
    db.prepare(
      "INSERT INTO portal_preferences(account,last_seen) VALUES(?,?) ON CONFLICT(account) DO UPDATE SET last_seen=excluded.last_seen",
    ).run(id, Date.now());
    return c.json({
      account: registry.account(id),
      online: Boolean(
        db
          .prepare("SELECT online FROM portal_preferences WHERE account=?")
          .get(id)!.online,
      ),
      counts: db
        .prepare(
          "SELECT kind,COUNT(*) AS count FROM portal_items WHERE account=? GROUP BY kind",
        )
        .all(id),
    });
  });
  app.put("/api/portal/preferences", async (c) => {
    const input = z
      .object({ online: z.boolean() })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "設定格式錯誤" }, 400);
    db.prepare(
      "INSERT INTO portal_preferences(account,online,last_seen) VALUES(?,?,?) ON CONFLICT(account) DO UPDATE SET online=excluded.online,last_seen=excluded.last_seen",
    ).run(c.get("account").id, Number(input.data.online), Date.now());
    return c.json({ ok: true });
  });
  app.get("/api/portal/online", (c) =>
    c.json({
      users: db
        .prepare(
          "SELECT a.handle,a.name FROM accounts a JOIN portal_preferences p ON a.id=p.account WHERE p.online=1 AND p.last_seen>? AND a.id<>? AND (a.password IS NOT NULL OR EXISTS (SELECT 1 FROM google_identities g WHERE g.account=a.id)) ORDER BY a.handle",
        )
        .all(Date.now() - 300000, c.get("account").id),
    }),
  );
  app.get("/api/portal/items", (c) => {
    const input = z
      .object({
        kind: z
          .enum(["bookmark", "article", "movie", "mood"])
          .default("bookmark"),
        scope: z
          .enum(["all", "personal", "home", "friends", "study", "work"])
          .default("all"),
        q: z.string().max(2000).default(""),
        sort: z.enum(["recent", "clicks", "created"]).default("recent"),
        offset: z.coerce
          .number()
          .int()
          .min(0)
          .max(Number.MAX_SAFE_INTEGER)
          .default(0),
        audience: z.enum(["mine", "friends"]).default("mine"),
      })
      .safeParse(c.req.query());
    if (!input.success) return c.json({ error: "查詢格式錯誤" }, 400);
    const { kind, scope, q, sort, offset, audience } = input.data;
    const owner = c.get("account").id;
    const audienceSql =
      audience === "mine"
        ? "i.account=?"
        : `i.visibility='friends' AND i.account IN (SELECT CASE WHEN sender=? THEN receiver ELSE sender END FROM friendships WHERE (sender=? OR receiver=?) AND status='accepted')`;
    const args = audience === "mine" ? [owner] : [owner, owner, owner];
    const filter = `${audienceSql} AND i.kind=? AND (?='all' OR i.scope=?) AND (?='' OR instr(lower(i.data),lower(?))>0)`;
    const params = [...args, kind, scope, scope, q, q];
    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM portal_items i WHERE ${filter}`)
      .get(...params)!.count;
    const order =
      sort === "clicks"
        ? "i.clicks DESC,i.updated DESC"
        : sort === "created"
          ? "i.created DESC"
          : "i.last_used DESC,i.updated DESC";
    const rows = db
      .prepare(
        `SELECT i.*,a.name,a.handle FROM portal_items i JOIN accounts a ON a.id=i.account WHERE ${filter} ORDER BY ${order},i.id LIMIT 20 OFFSET ?`,
      )
      .all(...params, offset);
    return c.json({
      total,
      offset,
      limit: 20,
      items: rows.map((row) => ({
        ...decode(row),
        owner:
          audience === "friends"
            ? { name: row.name, handle: row.handle }
            : undefined,
      })),
    });
  });
  app.put("/api/portal/items/:id", async (c) => {
    if (!z.uuid().safeParse(c.req.param("id")).success)
      return c.json({ error: "無效項目 ID" }, 400);
    const input = itemSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "請確認標題、HTTP/HTTPS 網址與欄位格式" }, 400);
    const value = {
        ...input.data,
        url: input.data.url ? webUrl(input.data.url)! : "",
      },
      id = c.req.param("id"),
      owner = c.get("account").id,
      now = Date.now();
    db.prepare(
      `INSERT INTO portal_items(account,id,kind,scope,visibility,data,created,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account,id) DO UPDATE SET kind=excluded.kind,scope=excluded.scope,visibility=excluded.visibility,data=excluded.data,updated=excluded.updated`,
    ).run(
      owner,
      id,
      value.kind,
      value.scope,
      value.visibility,
      JSON.stringify(value),
      now,
      now,
    );
    return c.json({ id, ok: true });
  });
  app.delete("/api/portal/items/:id", (c) => {
    const owner = c.get("account").id,
      id = c.req.param("id");
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM portal_links WHERE account=? AND item=?").run(
        owner,
        id,
      );
      db.prepare("DELETE FROM portal_items WHERE account=? AND id=?").run(
        owner,
        id,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return c.json({ ok: true });
  });
  app.get("/api/portal/items/:id/movie-summary", (c) => {
    const owner = c.get("account").id;
    const target = db
      .prepare(
        "SELECT data FROM portal_items WHERE account=? AND id=? AND kind='movie'",
      )
      .get(owner, c.req.param("id"));
    if (!target) return c.json({ error: "找不到電影" }, 404);
    const movie = JSON.parse(target.data as string);
    const rows = db
      .prepare(
        `SELECT account,data FROM portal_items WHERE kind='movie' AND (account=? OR (visibility='friends' AND account IN (SELECT CASE WHEN sender=? THEN receiver ELSE sender END FROM friendships WHERE (sender=? OR receiver=?) AND status='accepted'))) ORDER BY updated DESC,id`,
      )
      .all(owner, owner, owner, owner);
    const seen = new Set<string>();
    const values = rows.flatMap((row) => {
      const value = JSON.parse(row.data as string);
      const same = movie.url
        ? value.url === movie.url
        : !value.url && value.title === movie.title;
      if (!same || seen.has(row.account as string)) return [];
      seen.add(row.account as string);
      return [value];
    });
    const rated = values.filter((value) => value.rating > 0);
    return c.json({
      people: values.length,
      rated: rated.length,
      average: rated.length
        ? Math.round(
            (rated.reduce((sum, value) => sum + value.rating, 0) /
              rated.length) *
              10,
          ) / 10
        : null,
      watchedPeople: values.filter((value) => value.watched > 0).length,
      watchedTotal: values.reduce((sum, value) => sum + value.watched, 0),
      wishlist: values.filter((value) => value.wishlist).length,
      collections: values.filter((value) => value.collection).length,
      matching: movie.url ? "相同參考網址" : "相同片名且未填網址",
    });
  });
  app.post("/api/portal/items/:id/open", (c) => {
    const owner = c.get("account").id,
      id = c.req.param("id");
    const row = db
      .prepare("SELECT data FROM portal_items WHERE account=? AND id=?")
      .get(owner, id);
    if (!row) return c.json({ error: "找不到項目" }, 404);
    const value = JSON.parse(row.data as string);
    if (!value.url) return c.json({ error: "此項目沒有網址" }, 400);
    db.prepare(
      "UPDATE portal_items SET clicks=clicks+1,last_used=? WHERE account=? AND id=?",
    ).run(Date.now(), owner, id);
    return c.json({ url: value.url });
  });
  app.post("/api/portal/search", async (c) => {
    const input = z
      .object({
        engine: z.enum(
          Object.keys(engines) as [
            keyof typeof engines,
            ...Array<keyof typeof engines>,
          ],
        ),
        query: z.string().trim().min(1).max(2000),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "請選擇搜尋引擎並輸入關鍵字" }, 400);
    const { engine, query } = input.data;
    db.prepare(
      "INSERT INTO portal_searches VALUES(?,?,?,?,1,?) ON CONFLICT(account,engine,query) DO UPDATE SET uses=uses+1,last_used=excluded.last_used",
    ).run(c.get("account").id, randomUUID(), engine, query, Date.now());
    return c.json({ url: searchUrl(engine, query) });
  });
  app.get("/api/portal/searches", (c) => {
    const offset = Number(c.req.query("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      return c.json({ error: "分頁格式錯誤" }, 400);
    const owner = c.get("account").id;
    return c.json({
      total: db
        .prepare(
          "SELECT COUNT(*) AS count FROM portal_searches WHERE account=?",
        )
        .get(owner)!.count,
      items: db
        .prepare(
          "SELECT id,engine,query,uses,last_used FROM portal_searches WHERE account=? ORDER BY last_used DESC,id LIMIT 20 OFFSET ?",
        )
        .all(owner, offset),
    });
  });
  app.delete("/api/portal/searches/:id", (c) => {
    db.prepare("DELETE FROM portal_searches WHERE account=? AND id=?").run(
      c.get("account").id,
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });
  app.post("/api/portal/items/:id/link", async (c) => {
    const input = z
      .object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "請選 1、7 或 30 天" }, 400);
    const owner = c.get("account").id,
      id = c.req.param("id");
    const row = db
      .prepare("SELECT data FROM portal_items WHERE account=? AND id=?")
      .get(owner, id);
    if (!row || !JSON.parse(row.data as string).url)
      return c.json({ error: "找不到可分享的網址" }, 404);
    const token = secret(),
      linkId = randomUUID(),
      expires = Date.now() + input.data.days * 86400000;
    db.prepare(
      "INSERT INTO portal_links(id,hash,account,item,expires) VALUES(?,?,?,?,?)",
    ).run(linkId, digest(token), owner, id, expires);
    return c.json({ id: linkId, path: `/s/${token}`, expires }, 201);
  });
  app.get("/api/portal/links", (c) =>
    c.json({
      links: db
        .prepare(
          "SELECT l.id,l.expires,l.clicks,json_extract(i.data,'$.title') AS title FROM portal_links l JOIN portal_items i ON l.account=i.account AND l.item=i.id WHERE l.account=? AND l.expires>? ORDER BY l.expires DESC",
        )
        .all(c.get("account").id, Date.now()),
    }),
  );
  app.delete("/api/portal/links/:id", (c) => {
    db.prepare("DELETE FROM portal_links WHERE id=? AND account=?").run(
      c.req.param("id"),
      c.get("account").id,
    );
    return c.json({ ok: true });
  });
  app.get("/s/:token", (c) => {
    c.header("X-Robots-Tag", "noindex, nofollow");
    const row = db
      .prepare(
        "SELECT l.id,i.data FROM portal_links l JOIN portal_items i ON l.account=i.account AND l.item=i.id WHERE l.hash=? AND l.expires>?",
      )
      .get(digest(c.req.param("token")), Date.now());
    if (!row) return c.text("連結已失效或撤銷", 404);
    const value = JSON.parse(row.data as string);
    if (!value.url) return c.text("此項目已移除網址", 404);
    db.prepare("UPDATE portal_links SET clicks=clicks+1 WHERE id=?").run(
      row.id!,
    );
    return c.redirect(value.url, 302);
  });
  app.get("/api/portal/export", (c) =>
    c.json({
      version: 1,
      items: db
        .prepare(
          "SELECT * FROM portal_items WHERE account=? ORDER BY created,id",
        )
        .all(c.get("account").id)
        .map(decode),
    }),
  );
  app.get("/api/portal/feed", (c) => {
    const rows = db
      .prepare(
        "SELECT * FROM portal_items WHERE account=? AND kind IN ('bookmark','article') ORDER BY updated DESC,id",
      )
      .all(c.get("account").id)
      .map(decode);
    c.header("Content-Type", "application/rss+xml; charset=utf-8");
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>MyZilla 我的網址</title><description>私人書籤與網摘匯出</description><link>https://myzilla.observe.tw/</link>${rows.map((item) => `<item><title>${xml(item.title)}</title><link>${xml(item.url)}</link><guid isPermaLink="false">${xml(item.id)}</guid><description>${xml(item.notes)}</description><pubDate>${new Date(item.created).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`,
    );
  });
}
