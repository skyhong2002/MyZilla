import type { DatabaseSync } from "node:sqlite";

export type Taxon = { group: string; facet: string };
export type StoredDigest = {
  id: number;
  created: number;
  from: number;
  to: number;
  revision: string;
  inputHash: string;
  model: string;
  data: any;
};

// Model output per account. Raw events are never modified; every table is keyed by account.
export class DigestStore {
  constructor(
    private readonly db: DatabaseSync,
    readonly account: string,
  ) {}
  static migrate(db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_page_topics(account TEXT NOT NULL,url TEXT NOT NULL,raw TEXT NOT NULL,model TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(account,url));
CREATE TABLE IF NOT EXISTS ai_taxonomy(account TEXT NOT NULL,raw TEXT NOT NULL,grp TEXT NOT NULL,facet TEXT NOT NULL,PRIMARY KEY(account,raw));
CREATE TABLE IF NOT EXISTS ai_sessions(account TEXT NOT NULL,key TEXT NOT NULL,data TEXT NOT NULL,model TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(account,key));
CREATE TABLE IF NOT EXISTS ai_digests(id INTEGER PRIMARY KEY AUTOINCREMENT,account TEXT NOT NULL,created INTEGER NOT NULL,period_from INTEGER NOT NULL,period_to INTEGER NOT NULL,revision TEXT NOT NULL,input_hash TEXT NOT NULL,model TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ai_digests_account ON ai_digests(account,created);`);
  }
  pageTopics() {
    const rows = this.db
      .prepare("SELECT url,raw FROM ai_page_topics WHERE account=?")
      .all(this.account) as { url: string; raw: string }[];
    return new Map(rows.map((r) => [r.url, r.raw]));
  }
  savePageTopics(topics: [string, string][], model: string) {
    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO ai_page_topics VALUES(?,?,?,?,?)",
    );
    this.transaction(() => {
      for (const [url, raw] of topics)
        insert.run(this.account, url, raw, model, Date.now());
    });
  }
  taxonomy() {
    const rows = this.db
      .prepare("SELECT raw,grp,facet FROM ai_taxonomy WHERE account=?")
      .all(this.account) as { raw: string; grp: string; facet: string }[];
    return new Map<string, Taxon>(
      rows.map((r) => [r.raw, { group: r.grp, facet: r.facet }]),
    );
  }
  saveTaxonomy(entries: [string, Taxon][]) {
    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO ai_taxonomy VALUES(?,?,?,?)",
    );
    this.transaction(() => {
      for (const [raw, t] of entries)
        insert.run(this.account, raw, t.group, t.facet);
    });
  }
  sessions() {
    const rows = this.db
      .prepare("SELECT key,data FROM ai_sessions WHERE account=?")
      .all(this.account) as { key: string; data: string }[];
    return new Map(rows.map((r) => [r.key, JSON.parse(r.data)]));
  }
  saveSessions(entries: [string, unknown][], model: string) {
    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO ai_sessions VALUES(?,?,?,?,?)",
    );
    this.transaction(() => {
      for (const [key, data] of entries)
        insert.run(this.account, key, JSON.stringify(data), model, Date.now());
    });
  }
  latest(): StoredDigest | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM ai_digests WHERE account=? ORDER BY created DESC,id DESC LIMIT 1",
      )
      .get(this.account) as any;
    return row
      ? {
          id: row.id,
          created: row.created,
          from: row.period_from,
          to: row.period_to,
          revision: row.revision,
          inputHash: row.input_hash,
          model: row.model,
          data: JSON.parse(row.data),
        }
      : undefined;
  }
  saveDigest(d: Omit<StoredDigest, "id">) {
    this.db
      .prepare(
        "INSERT INTO ai_digests(account,created,period_from,period_to,revision,input_hash,model,data) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        this.account,
        d.created,
        d.from,
        d.to,
        d.revision,
        d.inputHash,
        d.model,
        JSON.stringify(d.data),
      );
  }
  // New visits that change nothing the model sees keep the digest; only the revision advances.
  touch(id: number, revision: string) {
    this.db
      .prepare("UPDATE ai_digests SET revision=? WHERE id=? AND account=?")
      .run(revision, id, this.account);
  }
  private transaction(work: () => void) {
    this.db.exec("BEGIN");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
