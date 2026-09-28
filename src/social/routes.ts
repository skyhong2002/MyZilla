import type { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Registry, digest, secret } from "../accounts/registry";
import { analyze, categories, compare, summary } from "./analysis";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
export function registerSocial(app: Hono, registry: Registry) {
  const db = registry.db;
  app.get("/api/community/interests", (c) =>
    c.json(analyze(registry, c.get("account").id)),
  );
  app.put("/api/community/categories", async (c) => {
    const input = z
      .object({
        domain: z.string().min(1).max(2000),
        category: z
          .enum(
            Object.keys(categories) as [
              keyof typeof categories,
              ...Array<keyof typeof categories>,
            ],
          )
          .nullable(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "分類或網站格式錯誤" }, 400);
    const { domain, category } = input.data;
    if (category === null)
      db.prepare(
        "DELETE FROM category_overrides WHERE account=? AND domain=?",
      ).run(c.get("account").id, domain);
    else
      db.prepare(
        "INSERT INTO category_overrides VALUES(?,?,?) ON CONFLICT(account,domain) DO UPDATE SET category=excluded.category",
      ).run(c.get("account").id, domain, category);
    return c.json({ ok: true });
  });
  app.put("/api/community/profile", async (c) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(80), matching: z.boolean() })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "個人設定格式錯誤" }, 400);
    db.prepare("UPDATE accounts SET name=?,matching=? WHERE id=?").run(
      input.data.name,
      Number(input.data.matching),
      c.get("account").id,
    );
    return c.json({ ok: true });
  });
  app.get("/api/community/friends", (c) => {
    const id = c.get("account").id;
    const rows = db
      .prepare("SELECT * FROM friendships WHERE sender=? OR receiver=?")
      .all(id, id);
    return c.json({
      friends: rows.map((row) => {
        const other = registry.account(
          (row.sender === id ? row.receiver : row.sender) as string,
        )!;
        return {
          id: other.id,
          handle: other.handle,
          name: other.name,
          status: row.status,
          direction: row.sender === id ? "outgoing" : "incoming",
        };
      }),
    });
  });
  app.post("/api/community/friends", async (c) => {
    const input = z
      .object({ handle: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,31}$/) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "請輸入對方帳號" }, 400);
    const id = c.get("account").id;
    const other = db
      .prepare(
        "SELECT id FROM accounts WHERE handle=? AND (password IS NOT NULL OR EXISTS (SELECT 1 FROM google_identities g WHERE g.account=accounts.id))",
      )
      .get(input.data.handle)?.id as string | undefined;
    if (!other || other === id)
      return c.json({ error: "找不到可邀請的帳號" }, 404);
    const existing = db
      .prepare(
        "SELECT 1 FROM friendships WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)",
      )
      .get(id, other, other, id);
    if (existing)
      return c.json({ error: "已有邀請或朋友關係，請在清單處理" }, 409);
    db.prepare("INSERT INTO friendships VALUES(?,?,'pending')").run(id, other);
    return c.json({ ok: true }, 201);
  });
  app.post("/api/community/friends/:id/accept", (c) => {
    const result = db
      .prepare(
        "UPDATE friendships SET status='accepted' WHERE sender=? AND receiver=? AND status='pending'",
      )
      .run(c.req.param("id"), c.get("account").id);
    return result.changes
      ? c.json({ ok: true })
      : c.json({ error: "找不到待接受的邀請" }, 404);
  });
  app.delete("/api/community/friends/:id", (c) => {
    const id = c.get("account").id,
      other = c.req.param("id");
    db.prepare(
      "DELETE FROM friendships WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)",
    ).run(id, other, other, id);
    if (
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='curation_members'",
        )
        .get()
    )
      db.prepare(
        "DELETE FROM curation_members WHERE (account=? AND collection IN (SELECT id FROM curation_collections WHERE account=?)) OR (account=? AND collection IN (SELECT id FROM curation_collections WHERE account=?))",
      ).run(id, other, other, id);
    return c.json({ ok: true });
  });
  app.get("/api/community/matches", (c) => {
    const me = c.get("account");
    if (!me.matching) return c.json({ enabled: false, matches: [] });
    const mine = analyze(registry, me.id);
    const friends = db
      .prepare(
        "SELECT CASE WHEN sender=? THEN receiver ELSE sender END AS id FROM friendships WHERE (sender=? OR receiver=?) AND status='accepted'",
      )
      .all(me.id, me.id, me.id);
    const matches = friends
      .map((row) => registry.account(row.id as string)!)
      .filter((friend) => friend.matching)
      .map((friend) => {
        const profile = analyze(registry, friend.id);
        return {
          id: friend.id,
          handle: friend.handle,
          name: friend.name,
          ...compare(mine, profile),
          profile: summary(profile),
        };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return c.json({ enabled: true, matches });
  });
  app.get("/api/community/shares", (c) =>
    c.json({
      shares: db
        .prepare(
          "SELECT id,expires FROM shares WHERE account=? AND expires>? ORDER BY expires DESC",
        )
        .all(c.get("account").id, Date.now()),
    }),
  );
  app.post("/api/community/shares", async (c) => {
    const input = z
      .object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "請選擇 1、7 或 30 天有效期" }, 400);
    const account = c.get("account");
    const snapshot = {
      name: account.name,
      ...summary(analyze(registry, account.id)),
    };
    const token = secret(),
      id = randomUUID(),
      expires = Date.now() + input.data.days * 86400000;
    db.prepare("DELETE FROM shares WHERE expires<=?").run(Date.now());
    db.prepare("INSERT INTO shares VALUES(?,?,?,?,?)").run(
      id,
      digest(token),
      account.id,
      JSON.stringify(snapshot),
      expires,
    );
    return c.json({ id, path: `/share/${token}`, expires }, 201);
  });
  app.delete("/api/community/shares/:id", (c) => {
    db.prepare("DELETE FROM shares WHERE id=? AND account=?").run(
      c.req.param("id"),
      c.get("account").id,
    );
    return c.json({ ok: true });
  });
  app.get("/share/:token", (c) => {
    c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
    const row = db
      .prepare("SELECT snapshot FROM shares WHERE hash=? AND expires>?")
      .get(digest(c.req.param("token")), Date.now());
    if (!row) return c.text("此分享不存在、已撤銷或已到期。", 404);
    const value = JSON.parse(row.snapshot as string) as {
      name: string;
    } & ReturnType<typeof summary>;
    return c.html(
      `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>興趣摘要 · MyZilla</title><body style="background:#0d0d0c;color:#f4f2ee;font:18px system-ui;max-width:720px;margin:48px auto;padding:24px"><p>MyZilla · 分享摘要</p><h1>${escape(value.name)} 的瀏覽興趣</h1><p>全部紀錄，共 ${value.total.toLocaleString()} 次造訪，已分類 ${value.classified.toLocaleString()} 次。</p>${value.categories.map((row) => `<p>${escape(row.label)}：${row.percent}%（${row.visits.toLocaleString()} 次）</p>`).join("")}<p>網站規則及使用者修正的分類；不是人格判斷。摘要建立於 ${new Date(value.generatedAt).toISOString().slice(0, 10)}，後續瀏覽不會更新這份快照。</p><p>此頁不含網址、標題、來源裝置或個別造訪時間。</p></body></html>`,
    );
  });
}
