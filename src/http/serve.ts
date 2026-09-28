import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "../server/app";
import { googleConfig } from "../accounts/google";
import { readConfig } from "../config";

export function startServer(mode: "combined" | "ingest" = "combined") {
  const config = readConfig(process.env, mode);
  const path = config.database;
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const app = createApp(
    db,
    config.token,
    mode,
    mode === "combined" ? googleConfig(process.env) : undefined,
  );
  if (mode === "combined") app.use("*", serveStatic({ root: "./dist/web" }));
  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
    },
    (info) =>
      console.log(`MyZilla listening on http://${info.address}:${info.port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(() => {
        db.close();
        process.exit(0);
      }),
    );

  return server;
}
