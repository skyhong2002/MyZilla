import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "myzilla-insights-"));
const token = "insights-browser-fixture-token-".repeat(2),
  base = "http://127.0.0.1:18147";
const server = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    env: {
      ...process.env,
      PORT: "18147",
      MYZILLA_DB: join(temp, "test.sqlite"),
      MYZILLA_TOKEN: token,
    },
    stdio: "pipe",
  },
);
let browser;
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const events = [];
  let index = 0;
  for (const date of ["2025-12-01", "2025-12-02", "2026-01-05", "2026-02-10"])
    for (let n = 0; n < 25; n++)
      events.push({
        kind: "visit",
        id: String(index++),
        url: `https://example.test/cloud/${n}`,
        title:
          n === 0
            ? "<img src=x onerror=alert(1)> OAuth Cloudflare"
            : `OAuth Cloudflare ${n}`,
        visitedAt: Date.parse(date) + n * 60000,
        transition: "link",
      });
  for (let n = 0; n < 3; n++)
    events.push({
      kind: "visit",
      id: String(index++),
      url: `https://database.test/${n}`,
      title: "SQLite database",
      visitedAt: Date.parse("2026-02-10") + n * 60000,
      transition: "link",
    });
  const r = await fetch(base + "/api/events", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source: {
        browser: "Brave",
        profile: "Default",
        device: "Fixture",
        method: "native",
      },
      events,
    }),
  });
  assert.equal(r.status, 200);
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/dashboard.html");
  await page.locator("#token").fill(token);
  await page.getByRole("button", { name: "解鎖回顧", exact: true }).click();
  await page.locator("#personal-overview h2").waitFor();
  assert.equal(await page.locator("#time-stat").innerText(), "尚未記錄");
  await page.getByRole("link", { name: "展開五個面向 →", exact: true }).click();
  for (const id of ["map", "paths", "changes", "pairs", "long"])
    assert.ok(await page.locator("#insight-" + id).isVisible());
  const card = page.locator(".topic-card").filter({
    has: page.getByRole("heading", { name: "身分驗證與 OAuth", exact: true }),
  });
  await card.getByText("查看依據", { exact: true }).click();
  await card.locator(".insight-evidence ul").waitFor();
  assert.equal(await card.locator(".insight-evidence li").count(), 20);
  await card.getByRole("button", { name: "下一頁", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#insight-map .topic-card .insight-evidence") !==
      null,
  );
  await card
    .locator(".insight-evidence")
    .getByText(/第 21–25 項/)
    .waitFor();
  assert.equal(await page.locator("#personal-insights img").count(), 0);
  await card.getByText("調整這個主題", { exact: true }).click();
  await card.locator('input[name="label"]').fill("我的身分驗證專案");
  await card.locator('select[name="mode"]').selectOption("work");
  await card.getByRole("button", { name: "儲存調整", exact: true }).click();
  await page
    .locator("#insight-map")
    .getByRole("heading", { name: "我的身分驗證專案", exact: true })
    .waitFor();
  const changed = page.locator(".topic-card").filter({
    has: page.getByRole("heading", { name: "我的身分驗證專案", exact: true }),
  });
  await changed.getByText("調整這個主題", { exact: true }).click();
  await changed.locator("select").selectOption("exclude");
  await changed.getByRole("button", { name: "儲存調整", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#insight-map")
        ?.textContent.includes("我的身分驗證專案"),
  );
  await page.getByText(/我的主題調整/).click();
  await page.getByRole("button", { name: "恢復自動判斷", exact: true }).click();
  await page
    .locator("#insight-map")
    .getByRole("heading", { name: "身分驗證與 OAuth", exact: true })
    .waitFor();
  await page.locator("#insight-map").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "data/insights-desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 850 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: "data/insights-mobile.png", fullPage: false });
  await page.getByRole("button", { name: "近 7 天", exact: true }).click();
  await page
    .getByText("其中一期沒有內容紀錄，暫不判定升溫或淡出。", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all five insights, overview, evidence pagination, title escaping, topic rename/work/exclusion/reset, empty period and mobile layout",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  await rm(temp, { recursive: true, force: true });
}
