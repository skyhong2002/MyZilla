import type { Hono, Context } from "hono";
import { batchSchema } from "../shared/events";
import type { BrowsingRepository } from "./repository";

export function registerIngest(
  app: Hono,
  resolve: (c: Context) => BrowsingRepository,
) {
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
    return c.json(resolve(c).ingest(result.data));
  });
}
