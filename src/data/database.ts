import { DatabaseSync } from "node:sqlite";

export function initializeDatabase(db: DatabaseSync) {
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS events (
      device TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL,
      start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, data TEXT NOT NULL,
      domain TEXT NOT NULL, source TEXT NOT NULL,
      PRIMARY KEY(device, id)
    );
    CREATE INDEX IF NOT EXISTS events_time ON events(start_at, end_at);`);
}
