import type { Hono, Context } from "hono";
import { z } from "zod";
import type { Registry } from "../accounts/registry";
import { analyze, type Feedback } from "./analyze";
export function registerInsights(app: Hono, registry: Registry) {
  const db = registry.db;
  db.exec(
    "CREATE TABLE IF NOT EXISTS insight_feedback(account TEXT NOT NULL,topic TEXT NOT NULL,label TEXT NOT NULL,mode TEXT NOT NULL,PRIMARY KEY(account,topic))",
  );
  const cache = new Map<
    string,
    { key: string; at: number; value: ReturnType<typeof analyze> }
  >();
  const params = (c: Context) => {
    const from = Number(c.req.query("from")),
      to = Number(c.req.query("to")),
      zone = c.req.query("zone") ?? "Asia/Taipei";
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to <= from ||
      to > 8640000000000000
    )
      throw Error("Invalid range");
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return { from, to, zone };
  };
  const result = (c: Context) => {
    const { from, to, zone } = params(c),
      account = c.get("account").id,
      repo = registry.repository(account);
    const feedback = db
      .prepare(
        "SELECT topic,label,mode FROM insight_feedback WHERE account=? ORDER BY topic",
      )
      .all(account) as Feedback[];
    const key = JSON.stringify([
      from,
      to,
      zone,
      repo.insightRevision(),
      feedback,
    ]);
    const old = cache.get(account);
    if (old?.key === key && Date.now() - old.at < 120000) return old.value;
    const value = analyze(repo.insightRows(), from, to, zone, feedback);
    if (cache.size >= 2) cache.delete(cache.keys().next().value!);
    cache.set(account, { key, at: Date.now(), value });
    return value;
  };
  app.get("/api/insights", (c) => {
    try {
      params(c);
    } catch {
      return c.json({ error: "請指定有效期間與時區" }, 400);
    }
    const { report } = result(c);
    const limit = Math.min(
      100,
      Math.max(1, Number(c.req.query("limit")) || 12),
    );
    const keys = [
      "topics",
      "changes",
      "intersections",
      "longterm",
      "paths",
    ] as const;
    const offset = Number(c.req.query("offset") ?? 0);
    const search = (c.req.query("q") ?? "").trim().toLocaleLowerCase();
    if (!Number.isSafeInteger(offset) || offset < 0 || search.length > 200)
      return c.json({ error: "Invalid search or offset" }, 400);
    const lists = Object.fromEntries(
      keys.map((k) => [
        k,
        (report[k] as any[]).filter(
          (v) =>
            !search ||
            [v.label, v.title, v.topic, v.a, v.b].some((text) =>
              String(text ?? "")
                .toLocaleLowerCase()
                .includes(search),
            ),
        ),
      ]),
    );
    const counts = Object.fromEntries(keys.map((k) => [k, lists[k].length]));
    return c.json({
      ...report,
      ...Object.fromEntries(
        keys.map((k) => [k, lists[k].slice(offset, offset + limit)]),
      ),
      counts,
      offset,
      limit,
      highlights: {
        topic: report.topics.find((t) => t.mode !== "work"),
        change: report.comparison.comparable ? report.changes[0] : undefined,
        long: report.longterm.find((t) => t.dormant) ?? report.longterm[0],
      },
    });
  });
  app.get("/api/insights/evidence", (c) => {
    try {
      params(c);
    } catch {
      return c.json({ error: "請指定有效期間與時區" }, 400);
    }
    const offset = Number(c.req.query("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      return c.json({ error: "Invalid offset" }, 400);
    const rows = result(c).evidence.get(c.req.query("topic") ?? "") ?? [];
    return c.json({
      total: rows.length,
      offset,
      items: rows.slice(offset, offset + 20),
    });
  });
  app.put("/api/insights/feedback", async (c) => {
    if (c.get("account").credential === "device")
      return c.json({ error: "請使用帳號登入調整洞察" }, 403);
    const input = z
      .object({
        topic: z.string().regex(/^[a-f0-9]{20}$/),
        label: z.string().trim().max(80).default(""),
        mode: z.enum(["interest", "work", "exclude"]),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "請確認主題設定" }, 400);
    const { topic, label, mode } = input.data;
    db.prepare(
      "INSERT INTO insight_feedback VALUES(?,?,?,?) ON CONFLICT(account,topic) DO UPDATE SET label=excluded.label,mode=excluded.mode",
    ).run(c.get("account").id, topic, label, mode);
    cache.delete(c.get("account").id);
    return c.json({ ok: true });
  });
  app.delete("/api/insights/feedback/:topic", (c) => {
    if (c.get("account").credential === "device")
      return c.json({ error: "請使用帳號登入調整洞察" }, 403);
    db.prepare("DELETE FROM insight_feedback WHERE account=? AND topic=?").run(
      c.get("account").id,
      c.req.param("topic"),
    );
    cache.delete(c.get("account").id);
    return c.json({ ok: true });
  });
}
