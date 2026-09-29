import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "myzilla-portal-")),
  token = "portal-browser-fixture-token-more-than-32-characters",
  base = "http://127.0.0.1:18145";
const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  env: {
    ...process.env,
    PORT: "18145",
    HOST: "127.0.0.1",
    MYZILLA_DB: join(temporary, "test.sqlite"),
    MYZILLA_TOKEN: token,
  },
  stdio: "pipe",
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.fulfill({ status: 200, body: "Fixture external destination" }),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/#bookmark");
  await page.locator('[name="token"]').fill(token);
  await page.getByRole("button", { name: "開啟我的入口", exact: true }).click();
  await page.getByRole("button", { name: "新增網址", exact: true }).waitFor();
  await page.getByRole("button", { name: "新增網址", exact: true }).click();
  const dialog = page.locator("#editor");
  await dialog.locator('[name="title"]').fill("研究書籤 <img src=x>");
  await dialog
    .locator('[name="url"]')
    .fill("https://example.org/research?a=1&b=2");
  await dialog.locator('[name="scope"]').selectOption("study");
  await dialog.locator('[name="tags"]').fill("研究, 網路");
  await dialog.locator('[name="notes"]').fill("私人筆記");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await page
    .getByRole("heading", { name: "研究書籤 <img src=x>", exact: true })
    .waitFor();
  assert.equal(await page.locator("main img:not([data-favicon])").count(), 0);
  await page.locator("#scope").selectOption("home");
  await page
    .getByText("目前沒有項目。新增收藏，或調整搜尋與分類。", { exact: true })
    .waitFor();
  await page.locator("#scope").selectOption("study");
  await page
    .getByRole("heading", { name: "研究書籤 <img src=x>", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "開啟網址 ↗", exact: true }).click();
  await page.getByText("1 次開啟", { exact: false }).waitFor();
  await page.getByRole("button", { name: "建立分享連結", exact: true }).click();
  await dialog.getByRole("button", { name: "建立連結", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("/s/"),
  );
  const link = (await page.locator("#notice").innerText())
    .split("：")
    .slice(1)
    .join("：");
  assert.equal((await fetch(link, { redirect: "manual" })).status, 302);
  await page.getByRole("link", { name: "短網址管理", exact: true }).click();
  await page.getByRole("button", { name: "撤銷連結" }).click();
  await page
    .locator(".ux-confirm")
    .getByRole("button", { name: "撤銷連結", exact: true })
    .click();
  await page.getByText("還沒有分享連結。", { exact: true }).waitFor();
  assert.equal((await fetch(link, { redirect: "manual" })).status, 404);
  await page.getByRole("link", { name: "我的電影", exact: true }).click();
  await page.getByRole("button", { name: "新增電影", exact: true }).click();
  await dialog.locator('[name="title"]').fill("測試電影");
  await dialog.locator('[name="rating"]').fill("9");
  await dialog.locator('[name="watched"]').fill("2");
  await dialog.locator('[name="collection"]').fill("DVD");
  await dialog.locator('[name="wishlist"]').check();
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await page
    .getByText("評分 9/10 · 看過 2 次 · 願望清單 · 收藏：DVD", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "朋友觀影概況", exact: true }).click();
  await dialog
    .getByText("1 人收藏此片 · 1 人評分 · 平均 9/10", { exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "關閉", exact: true }).click();
  await page
    .locator('[data-form="search"] [name="query"]')
    .fill("fixture only");
  await page.getByRole("button", { name: "搜尋並記錄", exact: true }).click();
  await page.getByText("fixture only", { exact: true }).waitFor();
  await page.getByRole("button", { name: "再次搜尋", exact: true }).click();
  await page.getByText(/Google · 2 次/).waitFor();
  await page.getByRole("link", { name: "匯入與工具", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下載 JSON 備份", exact: true })
    .click();
  const file = await downloaded;
  const backup = await readFile(await file.path());
  assert.equal(JSON.parse(backup).items.length, 2);
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.getByRole("button", { name: "匯入全部項目", exact: true }).click();
  await page
    .locator(".ux-confirm")
    .getByRole("button", { name: "開始匯入", exact: true })
    .click();
  await page.getByText(/匯入完成：接受 2、拒收 0/).waitFor();
  const rssDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下載私人書籤 RSS", exact: true })
    .click();
  const rss = await rssDownload;
  assert.ok(
    (await readFile(await rss.path(), "utf8")).includes("&lt;img src=x&gt;"),
  );
  await page.getByRole("link", { name: "我的網址", exact: true }).click();
  await page
    .getByRole("heading", { name: "研究書籤 <img src=x>", exact: true })
    .waitFor();
  await page.screenshot({
    path: "data/myzilla-portal-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "data/myzilla-portal-mobile.png",
    fullPage: true,
  });
  await page
    .locator(".quick-nav")
    .getByRole("link", { name: "我的心情", exact: true })
    .click();
  await page.getByRole("button", { name: "新增心情", exact: true }).click();
  await dialog.locator('[name="title"]').fill("今天的心情");
  await dialog.locator('[name="mood"]').selectOption("happy");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await page
    .getByRole("heading", { name: "今天的心情", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: classic portal login, bookmark editing/filtering, click tracking, short-link revoke, movie details, private search, JSON replay, RSS export, mood and desktop/mobile layout",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await rm(temporary, { recursive: true, force: true });
}
