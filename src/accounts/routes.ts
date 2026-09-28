import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { Registry, digest, secret, passwordHash } from "./registry";
const handle = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,31}$/);
const password = z.string().min(12).max(128);
const identity = z.object({
  handle,
  name: z.string().trim().min(1).max(80),
  password,
});
export function registerAccounts(app: Hono, registry: Registry) {
  app.use(
    "/api/community/*",
    bodyLimit({
      maxSize: 8192,
      onError: (c) => c.json({ error: "請求內容過大" }, 413),
    }),
  );
  let windowStart = 0,
    attempts = 0,
    active = 0;
  app.use(
    "/auth/*",
    bodyLimit({
      maxSize: 8192,
      onError: (c) => c.json({ error: "請求內容過大" }, 413),
    }),
  );
  app.use("/auth/*", async (c, next) => {
    if (Date.now() - windowStart > 60000) {
      windowStart = Date.now();
      attempts = 0;
    }
    if (++attempts > 30 || active >= 4) {
      c.header("Retry-After", "60");
      return c.json({ error: "嘗試過於頻繁，請稍後再試" }, 429);
    }
    active++;
    try {
      await next();
    } finally {
      active--;
    }
  });
  app.post("/auth/login", async (c) => {
    const input = z
      .object({ handle, password })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "請輸入有效帳號與至少 12 字元的密碼" }, 400);
    const token = await registry.login(input.data.handle, input.data.password);
    return token
      ? c.json({ token })
      : c.json({ error: "帳號或密碼不正確" }, 401);
  });
  app.post("/auth/register", async (c) => {
    const input = identity
      .extend({ invitation: z.string().min(32).max(100) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        {
          error:
            "帳號需為 3–32 位小寫英數、底線或連字號，密碼至少 12 字元；需有效邀請碼",
        },
        400,
      );
    try {
      const { handle, name, password, invitation } = input.data;
      return c.json(
        { token: await registry.create(handle, name, password, invitation) },
        201,
      );
    } catch {
      return c.json({ error: "無法建立帳號：邀請碼失效或帳號已使用" }, 409);
    }
  });
  app.get("/api/community/me", (c) => {
    const account = c.get("account");
    const claimed = Boolean(
      registry.db
        .prepare("SELECT password FROM accounts WHERE id=?")
        .get(account.id)?.password,
    );
    const google = registry.db
      .prepare("SELECT email FROM google_identities WHERE account=?")
      .get(account.id);
    return c.json({
      ...registry.account(account.id),
      googleEmail: google?.email ?? null,
      claimed,
      credential: account.credential,
    });
  });
  app.post("/api/community/claim", async (c) => {
    if (
      c.get("account").id !== "owner" ||
      c.get("account").credential !== "legacy"
    )
      return c.json({ error: "請使用原始擁有者金鑰" }, 403);
    const input = identity.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: "請確認帳號格式、顯示名稱與至少 12 字元的密碼" },
        400,
      );
    const { handle, name, password } = input.data;
    const hash = await passwordHash(password);
    try {
      const result = registry.db
        .prepare(
          "UPDATE accounts SET handle=?,name=?,password=? WHERE id='owner' AND password IS NULL",
        )
        .run(handle, name, hash);
      if (!result.changes)
        return c.json({ error: "擁有者帳號已建立，請直接登入" }, 409);
    } catch {
      return c.json({ error: "帳號名稱已使用" }, 409);
    }
    return c.json({ token: registry.credential("owner") });
  });
  app.post("/api/community/logout", (c) => {
    registry.db
      .prepare("DELETE FROM credentials WHERE hash=?")
      .run(digest(c.req.header("Authorization")!.slice(7)));
    return c.json({ ok: true });
  });
  app.post("/api/community/password", async (c) => {
    const input = z
      .object({ current: password, password })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "密碼需為 12–128 字元" }, 400);
    const account = c.get("account");
    if (!(await registry.login(account.handle, input.data.current)))
      return c.json({ error: "目前密碼不正確" }, 403);
    const hash = await passwordHash(input.data.password);
    registry.db.exec("BEGIN");
    try {
      registry.db
        .prepare("UPDATE accounts SET password=? WHERE id=?")
        .run(hash, account.id);
      registry.db
        .prepare("DELETE FROM credentials WHERE account=? AND kind='session'")
        .run(account.id);
      registry.db.exec("COMMIT");
    } catch (e) {
      registry.db.exec("ROLLBACK");
      throw e;
    }
    return c.json({ token: registry.credential(account.id) });
  });
  app.post("/api/community/invitations", (c) => {
    if (c.get("account").id !== "owner")
      return c.json({ error: "僅擁有者可以邀請加入本站" }, 403);
    const invitation = secret();
    registry.db
      .prepare("INSERT INTO invitations(hash,expires) VALUES(?,?)")
      .run(digest(invitation), Date.now() + 7 * 86400000);
    return c.json({ invitation, expiresInDays: 7 }, 201);
  });
  app.post("/api/community/device-token", (c) =>
    c.json({
      token: registry.credential(c.get("account").id, "device"),
      expiresInDays: 365,
    }),
  );
  app.delete("/api/community/device-token", (c) => {
    registry.db
      .prepare("DELETE FROM credentials WHERE account=? AND kind='device'")
      .run(c.get("account").id);
    return c.json({ ok: true });
  });
}
