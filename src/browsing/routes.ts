import type { Hono } from "hono";
import type { BrowsingRepository } from "./repository";

export function registerBrowsing(app: Hono, repository: BrowsingRepository) {
  app.get("/api/sources", (c) => c.json({ sources: repository.sources() }));
  app.get("/api/report", (c) => {
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from)
      return c.json({ error: "Invalid date range" }, 400);
    return c.json(repository.report(from, to));
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
    return c.json(repository.visits(from, to, offset, limit, query));
  });
}
