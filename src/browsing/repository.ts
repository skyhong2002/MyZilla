import type { DatabaseSync } from "node:sqlite";
import { eventSchema, batchSchema } from "../shared/events";
import { domain } from "../shared/model";
import type { z } from "zod";

export class BrowsingRepository {
  constructor(private readonly db: DatabaseSync) {}
  ingest(batch: z.infer<typeof batchSchema>) {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO events(device,id,kind,start_at,end_at,data,domain,source) VALUES(?,?,?,?,?,?,?,?)",
    );
    let inserted = 0;
    let accepted = 0;
    const rejections: { index: number; id: unknown; reason: string }[] = [];
    this.db.exec("BEGIN");
    try {
      for (const [index, raw] of batch.events.entries()) {
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
            batch.deviceId,
            event.id,
            event.kind,
            start,
            end,
            JSON.stringify(event),
            host,
            JSON.stringify(batch.source),
          ).changes,
        );
        accepted++;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      accepted,
      inserted,
      duplicates: accepted - inserted,
      rejected: rejections.length,
      rejections,
    };
  }
  sources() {
    return this.db
      .prepare(
        `SELECT device AS deviceId, source, kind, COUNT(*) AS count, MIN(start_at) AS firstAt, MAX(start_at) AS lastAt FROM events GROUP BY device, source, kind ORDER BY source`,
      )
      .all()
      .map((row) => ({ ...row, source: JSON.parse(row.source as string) }));
  }
  report(from: number, to: number) {
    const sites = this.db
      .prepare(
        `SELECT domain,
      SUM(CASE WHEN kind='visit' AND start_at>=? THEN 1 ELSE 0 END) AS visits,
      SUM(CASE WHEN kind='attention' THEN MAX(0, MIN(end_at,?) - MAX(start_at,?)) ELSE 0 END) AS milliseconds
      FROM events WHERE start_at<? AND end_at>=? GROUP BY domain HAVING visits>0 OR milliseconds>0 ORDER BY milliseconds DESC, visits DESC`,
      )
      .all(from, to, from, to, from);
    const count = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM events WHERE kind='visit' AND start_at>=? AND start_at<?`,
      )
      .get(from, to)!;
    return { sites, visitCount: count.count, from, to };
  }
  visits(
    from: number,
    to: number,
    offset: number,
    limit: number,
    query: string,
  ) {
    const filter = `kind='visit' AND start_at>=? AND start_at<? AND (?='' OR instr(lower(json_extract(data,'$.url')),lower(?))>0 OR instr(lower(json_extract(data,'$.title')),lower(?))>0)`;
    const args = [from, to, query, query, query];
    const count = this.db
      .prepare(`SELECT COUNT(*) AS count FROM events WHERE ${filter}`)
      .get(...args)!;
    const rows = this.db
      .prepare(
        `SELECT data,source,device FROM events WHERE ${filter} ORDER BY start_at DESC,device,id LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, offset);
    return {
      total: count.count,
      offset,
      limit,
      visits: rows.map((row) => ({
        ...JSON.parse(row.data as string),
        source: JSON.parse(row.source as string),
        deviceId: row.device,
      })),
    };
  }
}
