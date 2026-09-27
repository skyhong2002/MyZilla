import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";

export function createBaseApp(token: string) {
  if (token.length < 32)
    throw new Error("MYZILLA_TOKEN must contain at least 32 characters");
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    await next();
  });
  app.get("/health", (c) => c.json({ ok: true, version: "0.1.0" }));
  app.use("/api/*", async (c, next) => {
    const supplied = Buffer.from(c.req.header("Authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return c.json({ error: "請檢查存取金鑰" }, 401);
    await next();
  });
  app.use("/api/*", bodyLimit({ maxSize: 16 * 1024 * 1024 }));
  app.onError((error, c) => {
    console.error(error.message);
    return c.json({ error: "伺服器處理失敗，資料仍可重試同步" }, 500);
  });
  return app;
}
