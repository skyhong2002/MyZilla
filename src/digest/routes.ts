import type { Hono } from "hono";
import type { Registry } from "../accounts/registry";
import { DigestStore } from "./store";

// Read-only: digests are produced by src/digest/job.ts, never on request.
export function registerDigest(app: Hono, registry: Registry) {
  DigestStore.migrate(registry.db);
  app.get("/api/digest", (c) => {
    const latest = new DigestStore(registry.db, c.get("account").id).latest();
    return c.json({
      digest: latest
        ? {
            created: latest.created,
            from: latest.from,
            to: latest.to,
            ...latest.data,
          }
        : null,
    });
  });
}
