import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../data/database";
import { BrowsingRepository } from "../browsing/repository";
const scrypt = promisify(scryptCallback);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export type Account = {
  id: string;
  handle: string;
  name: string;
  matching: number;
  credential?: string;
};
declare module "hono" {
  interface ContextVariableMap {
    account: Account;
  }
}

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
async function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(key, "hex"));
}
export class Registry {
  constructor(
    readonly db: DatabaseSync,
    private readonly ownerToken: string,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT, matching INTEGER NOT NULL DEFAULT 0);
      INSERT OR IGNORE INTO accounts(id,handle,name) VALUES('owner','owner','我的瀏覽空間');
      CREATE TABLE IF NOT EXISTS credentials(hash TEXT PRIMARY KEY, account TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invitations(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS friendships(sender TEXT NOT NULL, receiver TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(sender,receiver));
      CREATE TABLE IF NOT EXISTS category_overrides(account TEXT NOT NULL, domain TEXT NOT NULL, category TEXT NOT NULL, PRIMARY KEY(account,domain));
      CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, account TEXT NOT NULL, snapshot TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  account(id: string) {
    return this.db
      .prepare("SELECT id,handle,name,matching FROM accounts WHERE id=?")
      .get(id) as Account | undefined;
  }
  authenticate(auth: string | undefined): Account | undefined {
    if (!auth?.startsWith("Bearer ")) return;
    const token = auth.slice(7);
    if (
      timingSafeEqual(
        Buffer.from(digest(token)),
        Buffer.from(digest(this.ownerToken)),
      )
    )
      return { ...this.account("owner")!, credential: "legacy" };
    const row = this.db
      .prepare(
        "SELECT account,kind FROM credentials WHERE hash=? AND expires>?",
      )
      .get(digest(token), Date.now());
    if (row)
      return {
        ...this.account(row.account as string)!,
        credential: row.kind as string,
      };
  }
  repository(id: string) {
    if (!this.account(id)) throw new Error("Unknown account");
    const table =
      id === "owner" ? "events" : `account_events_${id.replaceAll("-", "")}`;
    return new BrowsingRepository(this.db, table);
  }
  credential(id: string, kind = "session") {
    const token = secret();
    this.db.prepare("DELETE FROM credentials WHERE expires<=?").run(Date.now());
    if (kind === "device")
      this.db
        .prepare("DELETE FROM credentials WHERE account=? AND kind='device'")
        .run(id);
    this.db
      .prepare("INSERT INTO credentials VALUES(?,?,?,?)")
      .run(
        digest(token),
        id,
        kind,
        Date.now() + (kind === "device" ? 365 : 7) * 86400000,
      );
    return token;
  }
  async login(handle: string, password: string) {
    const row = this.db
      .prepare("SELECT id,password FROM accounts WHERE handle=?")
      .get(handle);
    // A fixed dummy salt/hash performs the same expensive derivation for unknown accounts.
    const valid = await passwordMatches(
      password,
      (row?.password as string) || `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!valid || !row?.password) return;
    // Do not mint a session for a password changed while scrypt was running.
    const current = this.db
      .prepare("SELECT password FROM accounts WHERE id=?")
      .get(row.id!);
    return current?.password === row.password
      ? this.credential(row.id as string)
      : undefined;
  }
  async create(
    handle: string,
    name: string,
    password: string,
    invitation: string,
  ) {
    const hash = await passwordHash(password);
    const id = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const used = this.db
        .prepare(
          "UPDATE invitations SET used=1 WHERE hash=? AND used=0 AND expires>?",
        )
        .run(digest(invitation), Date.now());
      if (!used.changes) throw new Error("邀請已失效或使用過");
      this.db
        .prepare(
          "INSERT INTO accounts(id,handle,name,password) VALUES(?,?,?,?)",
        )
        .run(id, handle, name, hash);
      initializeDatabase(this.db, `account_events_${id.replaceAll("-", "")}`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.credential(id);
  }
}
