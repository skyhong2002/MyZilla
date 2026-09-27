import { DatabaseSync } from "node:sqlite";

export function initializeDatabase(db: DatabaseSync, table = "events") {
  if (!/^(events|account_events_[a-f0-9]{32})$/.test(table))
    throw new Error("Invalid account table");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      device TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL,
      start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, data TEXT NOT NULL,
      domain TEXT NOT NULL, source TEXT NOT NULL,
      PRIMARY KEY(device, id)
    );
    CREATE INDEX IF NOT EXISTS ${table}_time ON ${table}(start_at, end_at);`);
}
