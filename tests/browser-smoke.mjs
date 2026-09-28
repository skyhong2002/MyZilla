import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "myzilla-browser-"));
const token = "browser-smoke-test-token-".repeat(3);
const port = 18141;
const server = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      MYZILLA_DB: join(temporary, "test.sqlite"),
      MYZILLA_TOKEN: token,
    },
    stdio: "pipe",
  },
);
let browser;
let context;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const events = Array.from({ length: 225 }, (_, i) => ({
    kind: "visit",
    id: `visit:${i}`,
    sourceVisitId: String(i),
    url: i === 0 ? "javascript:alert(1)" : `https://example.org/page/${i}`,
    title:
      i === 224
        ? "<img src=x onerror=alert(1)> historical needle"
        : `研究筆記 ${i}`,
    visitedAt: Date.now() - 365 * 86400000 + i,
    transition: "1",
  }));
  const uploaded = await fetch(`http://127.0.0.1:${port}/api/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceId: "2b9b1f4a-245e-4562-a1f8-a88834916f63",
      source: {
        browser: "Zen",
        profile: "Work",
        device: "Fixture",
        method: "native",
      },
      events,
    }),
  });
  assert.equal(uploaded.status, 200);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/dashboard.html`);
  await page.locator("#token").fill(token);
  await page.getByRole("button", { name: "解鎖回顧" }).click();
  await page.waitForFunction(
    () => document.querySelector("#visits-stat")?.textContent === "225",
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".visit").length === 200,
  );
  assert.equal(await page.locator(".visit").count(), 200);
  assert.equal(await page.locator("#overview-view").isVisible(), true);
  assert.equal(await page.locator("#settings").isVisible(), false);
  await page.getByRole("button", { name: "近 7 天", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#visits-stat")?.textContent === "0",
  );
  await page.locator('.page-nav [data-view="insights"]').click();
  assert.equal(new URL(page.url()).searchParams.get("range"), "7");
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#visits-stat")?.textContent === "225",
  );
  assert.equal(await page.locator("#insights-view").isVisible(), true);
  await page.getByText("網站使用統計", { exact: true }).click();
  await page.locator("#insights-metric").selectOption("milliseconds");
  assert.match(
    await page.locator("#distribution").innerText(),
    /時間正在慢慢累積/,
  );
  await page.locator("#insights-metric").selectOption("visits");
  await page.locator('.page-nav [data-view="recap"]').click();
  assert.match(await page.locator("#recap-content").innerText(), /225/);
  await page.locator('.page-nav [data-view="history"]').click();
  assert.equal(await page.locator("#overview-view").isVisible(), false);
  await page.getByRole("button", { name: "下一頁" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".visit").length === 25,
  );
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
  await page.locator("#search").fill("historical needle");
  await page.waitForFunction(
    () => document.querySelectorAll(".visit").length === 1,
  );
  assert.equal(await page.locator("#history-list img").count(), 0);
  assert.match(
    await page.locator("#history-list").innerText(),
    /historical needle/,
  );
  assert.match(page.url(), /q=historical/);
  await page.locator('.page-nav [data-view="overview"]').click();
  await page.goBack();
  await page.waitForFunction(
    () => !document.querySelector("#history-view").hidden,
  );
  assert.equal(await page.locator("#search").inputValue(), "historical needle");
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".visit").length === 1,
  );
  assert.equal(await page.locator("#history-view").isVisible(), true);
  assert.equal(await page.locator("#search").inputValue(), "historical needle");
  await page.locator("#search").fill("");
  await page.waitForFunction(
    () => document.querySelectorAll(".visit").length === 200,
  );
  await page.locator('.page-nav [data-view="overview"]').click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "data/myzilla-desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "data/myzilla-mobile.png", fullPage: false });
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#visits-stat")?.textContent === "—",
  );
  assert.deepEqual(errors, []);
  await browser.close();
  browser = undefined;

  const extensionPath = join(temporary, "extension");
  await cp(resolve("dist/chromium"), extensionPath, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(extensionPath, "manifest.json"), "utf8"),
  );
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(
    join(extensionPath, "manifest.json"),
    JSON.stringify(manifest),
  );
  context = await chromium.launchPersistentContext(join(temporary, "profile"), {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/index.html`);
  await extensionPage.waitForFunction(() =>
    document.querySelector("#capture-status")?.textContent?.includes("已暫停"),
  );
  await extensionPage
    .getByRole("button", { name: "開始記錄", exact: true })
    .click();
  await extensionPage.waitForFunction(() =>
    document.querySelector("#capture-status")?.textContent?.includes("記錄中"),
  );
  const viewed = await context.newPage();
  await viewed.goto(`http://127.0.0.1:${port}/health`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await extensionPage.bringToFront();
  await extensionPage
    .getByRole("button", { name: "暫停記錄", exact: true })
    .click();
  await extensionPage.waitForFunction(() =>
    document.querySelector("#capture-status")?.textContent?.includes("已暫停"),
  );
  const collected = await extensionPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({
      url: "http://127.0.0.1:18141/health",
    });
    const group = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id) });
    await chrome.tabGroups.update(group, { title: "Fixture shared reading" });
    return chrome.runtime.sendMessage({ type: "collect-tabs" });
  });
  assert.equal(collected.ok, true);
  assert.ok(
    collected.data.items.some(
      (t) =>
        t.url.endsWith("/health") && t.group.includes("Fixture shared reading"),
    ),
  );
  await extensionPage.getByRole("button", { name: "挑選開啟的分頁" }).click();
  await extensionPage.locator("[data-tab-pick]").first().waitFor();
  const stored = await worker.evaluate(async () => {
    const request = indexedDB.open("myzilla", 1);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const query = db.transaction("events").objectStore("events").getAll();
    return new Promise((resolve) => {
      query.onsuccess = () => resolve(query.result);
    });
  });
  assert.ok(
    stored.some((row) => row.event.kind === "visit"),
    "Real browser history event recorded",
  );
  assert.ok(
    stored.every((row) => row.synced === 0),
    "Offline events remain queued",
  );
  await extensionPage.evaluate(async () => {
    await chrome.history.addUrl({ url: "https://example.org/full-import" });
  });
  await extensionPage
    .getByRole("button", { name: "匯入本設定檔全部歷史", exact: true })
    .click();
  await extensionPage.waitForFunction(async () => {
    const value = await chrome.storage.local.get("importJob");
    return value.importJob?.running === false;
  });
  const oldImported = await extensionPage.evaluate(async () => {
    const request = indexedDB.open("myzilla", 1);
    const db = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const get = db.transaction("events").objectStore("events").getAll();
    return new Promise((resolve) => {
      get.onsuccess = () =>
        resolve(
          get.result.some((row) => row.event.url.includes("full-import")),
        );
    });
  });
  assert.equal(
    oldImported,
    true,
    "Full import retrieves existing history while recording is paused",
  );
  await extensionPage.locator("#server").fill(`http://127.0.0.1:${port}`);
  await extensionPage.locator("#browser-name").fill("Chromium test");
  await extensionPage.locator("#profile-name").fill("Isolated");
  await extensionPage.locator("#device-name").fill("Fixture device");
  await extensionPage.locator("#page-title").click();
  await extensionPage.waitForTimeout(5500);
  assert.equal(
    await extensionPage.locator("#profile-name").inputValue(),
    "Isolated",
    "Background refresh preserves unsaved configuration after focus leaves the field",
  );
  await extensionPage.locator("#token").fill(token);
  await extensionPage.getByRole("button", { name: "儲存並連線" }).click();
  await extensionPage.waitForFunction(() =>
    document.querySelector("#message")?.textContent?.includes("已連線"),
  );
  await extensionPage.locator('.site-nav [data-view="settings"]').click();
  await extensionPage
    .getByRole("button", { name: "立即同步", exact: true })
    .click();
  try {
    await extensionPage.waitForFunction(
      () =>
        document
          .querySelector("#capture-status")
          ?.textContent?.includes("待同步 0 筆"),
      undefined,
      { timeout: 10000 },
    );
  } catch (error) {
    console.log(
      await extensionPage.locator("#message").innerText(),
      await extensionPage.locator("#capture-status").innerText(),
    );
    throw error;
  }
  await extensionPage.locator("[data-tab-pick]").first().check();
  await extensionPage
    .getByRole("button", { name: "將已選分頁加入待整理" })
    .click();
  await extensionPage.waitForFunction(() =>
    document
      .querySelector("[data-tabs-status]")
      ?.textContent.includes("新增 1"),
  );
  const inbox = await (
    await fetch(`http://127.0.0.1:${port}/api/curation/inbox`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.equal(inbox.total, 1);
  assert.ok(inbox.items[0].url.endsWith("/health"));
  const sources = await (
    await fetch(`http://127.0.0.1:${port}/api/sources`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.ok(
    sources.sources.some(
      (s) =>
        s.source.browser === "Chromium test" &&
        s.kind === "visit" &&
        s.count > 0,
    ),
  );
  console.log(
    "PASS: desktop/mobile, all-history search and pagination, URL/title safety, lock, real Chromium capture, full historical import, offline outbox and authenticated sync",
  );
} finally {
  await context?.close();
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(temporary, { recursive: true, force: true });
}
