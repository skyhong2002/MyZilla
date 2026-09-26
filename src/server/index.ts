import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "./app";
const path = process.env.MYZILLA_DB ?? "./data/myzilla.sqlite";
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
const app = createApp(db, process.env.MYZILLA_TOKEN ?? "");
app.use("*", serveStatic({ root: "./dist/web" }));
const server = serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 18140),
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
