// Scheduled by deploy/myzilla-digest.timer. Owner only: other accounts have not agreed to send history to an external model.
// Usage: npm run digest [-- --force] [-- --days 7]
import { DatabaseSync } from "node:sqlite";
import { BrowsingRepository } from "../browsing/repository";
import { DigestStore } from "./store";
import { runDigest } from "./pipeline";
import { codexAsk } from "./codex";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const db = new DatabaseSync(process.env.MYZILLA_DB ?? "./data/myzilla.sqlite");
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
DigestStore.migrate(db);
const store = new DigestStore(db, "owner");
const repo = new BrowsingRepository(db, "events");
const log = (line: string) =>
  console.log(`[digest ${new Date().toISOString()}] ${line}`);

const codex = await codexAsk(log);
try {
  const result = await runDigest(
    store,
    {
      rows: () => repo.insightRows(),
      revision: () => repo.insightRevision(),
    },
    codex.ask,
    {
      days: Number(arg("--days") ?? 7),
      force: process.argv.includes("--force"),
    },
  );
  log(
    result.status === "skipped"
      ? `skipped: ${result.reason}`
      : `${result.status}; model calls: ${result.calls.join(", ") || "none"}`,
  );
} finally {
  await codex.close();
  db.close();
}
