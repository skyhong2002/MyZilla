import type { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../data/database";
import { BrowsingRepository } from "../browsing/repository";
import { registerIngest } from "../browsing/ingest";
import { registerBrowsing } from "../browsing/routes";
import { createBaseApp } from "../http/base";

export function createApp(
  db: DatabaseSync,
  token: string,
  mode: "combined" | "ingest" = "combined",
) {
  const app = createBaseApp(token);
  initializeDatabase(db);
  const repository = new BrowsingRepository(db);
  registerIngest(app, repository);
  if (mode === "combined") registerBrowsing(app, repository);
  return app;
}
