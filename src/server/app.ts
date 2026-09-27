import type { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../data/database";
import { Registry } from "../accounts/registry";
import { registerAccounts } from "../accounts/routes";
import { registerPortal } from "../portal/routes";
import { registerSocial } from "../social/routes";
import { registerIngest } from "../browsing/ingest";
import { registerBrowsing } from "../browsing/routes";
import { createBaseApp } from "../http/base";

export function createApp(
  db: DatabaseSync,
  token: string,
  mode: "combined" | "ingest" = "combined",
) {
  if (token.length < 32)
    throw new Error("MYZILLA_TOKEN must contain at least 32 characters");
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  initializeDatabase(db);
  const registry = new Registry(db, token);
  const app = createBaseApp(token, registry);
  registerIngest(app, (c) => registry.repository(c.get("account").id));
  if (mode === "combined") {
    registerBrowsing(app, (c) => registry.repository(c.get("account").id));
    registerAccounts(app, registry);
    registerSocial(app, registry);
    registerPortal(app, registry);
  }
  return app;
}
