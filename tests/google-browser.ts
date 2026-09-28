import { chromium } from "@playwright/test";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createServer } from "node:https";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app";
const temp = mkdtempSync(join(tmpdir(), "myzilla-google-"));
const db = new DatabaseSync(":memory:");
const origin = "https://localhost:18146";
const master = "google-browser-fixture-master-more-than-32-characters";
let nonce = "";
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(temp, "key.pem"),
    "-out",
    join(temp, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
  ],
  { stdio: "ignore" },
);
const app = createApp(
  db,
  master,
  "combined",
  { clientId: "fixture", clientSecret: "fixture", origin },
  async () => ({
    sub: "fixture-google",
    email: "fixture@example.test",
    email_verified: true,
    aud: "fixture",
    iss: "https://accounts.google.com",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    nonce,
  }),
);
app.use(
  "*",
  serveStatic({ root: process.env.MYZILLA_WEB_ROOT ?? "./dist/web" }),
);
const server = serve({
  fetch: app.fetch,
  createServer,
  serverOptions: {
    key: readFileSync(join(temp, "key.pem")),
    cert: readFileSync(join(temp, "cert.pem")),
  },
  port: 18146,
  hostname: "127.0.0.1",
});
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  // Playwright does not route subsequent hops in a server redirect chain.
  // Intercept the initial start response while retaining the real state cookie.
  await page.route(origin + "/auth/google/start", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const u = new URL(response.headers()["location"]);
    nonce = u.searchParams.get("nonce")!;
    await route.fulfill({
      response,
      status: 302,
      headers: {
        ...response.headers(),
        location:
          origin +
          "/auth/google/callback?code=fixture-code&state=" +
          u.searchParams.get("state"),
      },
    });
  });
  await page.route("https://accounts.google.com/**", async (route) => {
    const u = new URL(route.request().url());
    nonce = u.searchParams.get("nonce")!;
    assert.equal(
      u.searchParams.get("redirect_uri"),
      origin + "/auth/google/callback",
    );
    await route.fulfill({
      status: 302,
      headers: {
        location:
          origin +
          "/auth/google/callback?code=fixture-code&state=" +
          u.searchParams.get("state"),
      },
    });
  });
  await page.goto(origin + "/community.html");
  await page
    .getByRole("link", { name: "使用 Google 帳號登入", exact: true })
    .click();
  await page.getByText(/此 Google 帳號尚未連結。/).waitFor();
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM google_identities").get()!.n,
    0,
  );
  await page.locator('[data-form="legacy"] input[name="token"]').fill(master);
  await page.getByRole("button", { name: "使用金鑰開啟", exact: true }).click();
  await page
    .getByRole("button", { name: "連結 Google 帳號", exact: true })
    .click();
  await page
    .getByText("已連結：fixture@example.test", { exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).search, "");
  assert.equal(
    db.prepare("SELECT account FROM google_identities").get()!.account,
    "owner",
  );
  assert.equal(
    (await context.cookies()).some(
      (c) => c.name === "__Host-myzilla-google-finish",
    ),
    false,
  );
  const token = await page.evaluate(() =>
    sessionStorage.getItem("myzilla-token"),
  );
  assert.ok(token);
  assert.notEqual(token, master);
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await page
    .getByRole("link", { name: "使用 Google 帳號登入", exact: true })
    .click();
  await page
    .getByText("已連結：fixture@example.test", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 850 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  console.log(
    "PASS: HTTPS Google browser flow, unlinked denial, owner linking, single-use handoff, logout/relogin and mobile layout (mock Google identity provider)",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(temp, { recursive: true, force: true });
}
