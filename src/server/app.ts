import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { batchSchema, eventSchema } from "../shared/events";
import { domain } from "../shared/model";

export function createApp(db: DatabaseSync, token: string) {
  if (token.length < 32)
    throw new Error("MYZILLA_TOKEN must contain at least 32 characters");
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS events (
      device TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL,
      start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, data TEXT NOT NULL,
      domain TEXT NOT NULL, source TEXT NOT NULL,
      PRIMARY KEY(device, id)
    );
    CREATE INDEX IF NOT EXISTS events_time ON events(start_at, end_at);`);
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    await next();
  });
  app.get("/health", (c) => c.json({ ok: true, version: "0.1.0" }));
  app.use("/api/*", async (c, next) => {
    const supplied = Buffer.from(c.req.header("Authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return c.json({ error: "請檢查存取金鑰" }, 401);
    await next();
  });
  app.use("/api/*", bodyLimit({ maxSize: 16 * 1024 * 1024 }));
  app.post("/api/events", async (c) => {
    let value: unknown;
    try {
      value = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const result = batchSchema.safeParse(value);
    if (!result.success)
      return c.json(
        {
          error:
            "Invalid batch envelope: deviceId, source and 1–250 events required",
        },
        400,
      );
    const insert = db.prepare(
      "INSERT OR IGNORE INTO events(device,id,kind,start_at,end_at,data,domain,source) VALUES(?,?,?,?,?,?,?,?)",
    );
    let inserted = 0;
    let accepted = 0;
    const rejections: { index: number; id: unknown; reason: string }[] = [];
    db.exec("BEGIN");
    try {
      for (const [index, raw] of result.data.events.entries()) {
        const parsed = eventSchema.safeParse(raw);
        if (!parsed.success) {
          rejections.push({
            index,
            id: (raw as { id?: unknown } | null)?.id ?? null,
            reason: parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          });
          continue;
        }
        const event = parsed.data;
        const start = event.kind === "visit" ? event.visitedAt : event.startAt;
        const end = event.kind === "visit" ? event.visitedAt : event.endAt;
        const host = domain(event.url) || "(internal / non-web)";
        inserted += Number(
          insert.run(
            result.data.deviceId,
            event.id,
            event.kind,
            start,
            end,
            JSON.stringify(event),
            host,
            JSON.stringify(result.data.source),
          ).changes,
        );
        accepted++;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return c.json({
      accepted,
      inserted,
      duplicates: accepted - inserted,
      rejected: rejections.length,
      rejections,
    });
  });
  app.get("/api/sources", (c) =>
    c.json({
      sources: db
        .prepare(
          `SELECT device AS deviceId, source, kind, COUNT(*) AS count, MIN(start_at) AS firstAt, MAX(start_at) AS lastAt FROM events GROUP BY device, source, kind ORDER BY source`,
        )
        .all()
        .map((row) => ({ ...row, source: JSON.parse(row.source as string) })),
    }),
  );
  app.get("/api/report", (c) => {
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from)
      return c.json({ error: "Invalid date range" }, 400);
    const sites = db
      .prepare(
        `SELECT domain,
      SUM(CASE WHEN kind='visit' AND start_at>=? THEN 1 ELSE 0 END) AS visits,
      SUM(CASE WHEN kind='attention' THEN MAX(0, MIN(end_at,?) - MAX(start_at,?)) ELSE 0 END) AS milliseconds
      FROM events WHERE start_at<? AND end_at>=? GROUP BY domain HAVING visits>0 OR milliseconds>0 ORDER BY milliseconds DESC, visits DESC`,
      )
      .all(from, to, from, to, from);
    const count = db
      .prepare(
        `SELECT COUNT(*) AS count FROM events WHERE kind='visit' AND start_at>=? AND start_at<?`,
      )
      .get(from, to)!;
    return c.json({ sites, visitCount: count.count, from, to });
  });
  app.get("/api/visits", (c) => {
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    const offset = Number(c.req.query("offset") ?? 0);
    const limit = Number(c.req.query("limit") ?? 200);
    const query = c.req.query("q") ?? "";
    if (
      ![from, to, offset, limit].every(Number.isSafeInteger) ||
      to <= from ||
      offset < 0 ||
      limit < 1 ||
      limit > 500 ||
      query.length > 2000
    )
      return c.json({ error: "Invalid query" }, 400);
    const filter = `kind='visit' AND start_at>=? AND start_at<? AND (?='' OR instr(lower(json_extract(data,'$.url')),lower(?))>0 OR instr(lower(json_extract(data,'$.title')),lower(?))>0)`;
    const args = [from, to, query, query, query];
    const count = db
      .prepare(`SELECT COUNT(*) AS count FROM events WHERE ${filter}`)
      .get(...args)!;
    const rows = db
      .prepare(
        `SELECT data,source,device FROM events WHERE ${filter} ORDER BY start_at DESC,device,id LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, offset);
    return c.json({
      total: count.count,
      offset,
      limit,
      visits: rows.map((row) => ({
        ...JSON.parse(row.data as string),
        source: JSON.parse(row.source as string),
        deviceId: row.device,
      })),
    });
  });
  app.onError((error, c) => {
    console.error(error.message);
    return c.json({ error: "伺服器處理失敗，資料仍可重試同步" }, 500);
  });
  return app;
}
