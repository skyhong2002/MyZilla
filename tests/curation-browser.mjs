import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "myzilla-curation-")),
  base = "http://127.0.0.1:18148",
  token = "curation-browser-fixture-".repeat(3);
const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  env: {
    ...process.env,
    PORT: "18148",
    HOST: "127.0.0.1",
    MYZILLA_DB: join(temp, "test.sqlite"),
    MYZILLA_TOKEN: token,
  },
  stdio: "pipe",
});
let browser;
const call = async (path, method = "GET", body, credential = token) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  return data;
};
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const events = [];
  for (const day of ["2026-09-01", "2026-09-02"]) {
    for (let i = 0; i < 25; i++)
      events.push({
        id: `${day}-${i}`,
        kind: "visit",
        title: `OAuth Cloudflare 部署 ${i}`,
        url: `https://example.org/cloudflare/${i}`,
        visitedAt: Date.parse(day) + i * 60000,
        transition: "link",
      });
  }
  await call("/api/events", "POST", {
    deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    source: {
      browser: "Brave",
      profile: "Default",
      device: "Fixture",
      method: "native",
    },
    events,
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 1000 },
  });
  await context.addInitScript(
    (t) => sessionStorage.setItem("myzilla-token", t),
    token,
  );
  const page = await context.newPage(),
    errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE", m.text());
  });
  page.on("requestfailed", (r) =>
    console.error("REQUEST", r.url(), r.failure()),
  );
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "從看過的，找到值得留下的。" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "挑選相關頁面 →" }).first().click();
  await expect(page.locator("[data-pick]"))
    .toHaveCount(20)
    .catch(async (e) => {
      console.error(page.url(), await page.content());
      throw e;
    });
  await page.locator("[data-select-all]").check();
  await page.getByRole("button", { name: "整理已選頁面" }).click();
  let dialog = page.locator("#curation-dialog");
  await dialog
    .locator('[data-new-collection] [name="title"]')
    .fill("部署研究選集");
  await dialog.getByRole("button", { name: "建立私人選集並加入" }).click();
  await expect(dialog).toHaveCount(0);
  const id = (await call("/api/curation/collections")).items[0].id;
  assert.equal(
    (await call("/api/curation/collections/" + id)).items.length,
    20,
  );
  await page.goto(base + "/?collection=" + id + "#collections");
  await expect(
    page.getByRole("heading", { name: "部署研究選集", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "寫推薦理由", exact: true })
    .first()
    .click();
  dialog = page.locator("#curation-dialog");
  await dialog
    .locator('[name="note"]')
    .fill("先讀這篇，再看其他部署方法。<script>private()</script>");
  await dialog.getByRole("button", { name: "儲存推薦理由" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".workspace-item").first()).toContainText(
    "先讀這篇",
  );
  await page.getByRole("button", { name: "下移", exact: true }).first().click();
  await expect(page.locator(".workspace-item").nth(1)).toContainText(
    "先讀這篇",
  );
  await page.getByRole("button", { name: "預覽與分享" }).click();
  dialog = page.locator("#curation-dialog");
  await expect(dialog.locator(".share-preview li")).toHaveCount(20);
  await dialog
    .getByRole("button", { name: "建立分享連結", exact: true })
    .click();
  const link = await dialog.locator("input[readonly]").inputValue();
  assert.equal((await fetch(link)).status, 200);
  const html = await (await fetch(link)).text();
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("visitedAt"));
  await dialog.getByRole("button", { name: "關閉對話框" }).click();
  await page.getByRole("button", { name: "撤銷連結", exact: true }).click();
  await page
    .locator(".ux-confirm")
    .getByRole("button", { name: "撤銷連結", exact: true })
    .click();
  await expect(
    page.getByText("尚未建立分享連結。", { exact: true }),
  ).toBeVisible();
  assert.equal((await fetch(link)).status, 404);
  // History -> inbox -> retained, including undo and form-draft protection.
  await page.goto(base + "/dashboard.html#history");
  await page
    .getByRole("button", { name: "整理這個連結", exact: true })
    .first()
    .click();
  dialog = page.locator("#curation-dialog");
  await dialog.getByRole("button", { name: "加入待整理", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(base + "/#inbox");
  await expect(page.locator(".workspace-item")).toHaveCount(1);
  await page.getByRole("button", { name: "略過", exact: true }).click();
  await expect(page.locator(".workspace-item")).toHaveCount(0);
  await page
    .locator("#ux-toast")
    .getByRole("button", { name: "復原", exact: true })
    .click();
  await expect(page.locator(".workspace-item")).toHaveCount(1);
  await page.getByRole("button", { name: "加入連結", exact: true }).click();
  dialog = page.locator("#curation-dialog");
  await dialog.locator('[name="title"]').fill("還沒寫完");
  await page.keyboard.press("Escape");
  await expect(page.locator(".ux-confirm")).toBeVisible();
  await page
    .locator(".ux-confirm")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(dialog.locator('[name="title"]')).toHaveValue("還沒寫完");
  await page.keyboard.press("Escape");
  await page
    .locator(".ux-confirm")
    .getByRole("button", { name: "放棄變更", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  // Friend receives access only after accepted relation + owner grants editing.
  const invitation = (await call("/api/community/invitations", "POST"))
    .invitation;
  const friend = (
    await call(
      "/auth/register",
      "POST",
      {
        handle: "friend",
        name: "共同整理的朋友",
        password: "fixture-password-12345",
        invitation,
      },
      "",
    )
  ).token;
  const friendId = (await call("/api/community/me", "GET", undefined, friend))
    .id;
  await call("/api/community/friends", "POST", { handle: "friend" });
  await call("/api/community/friends/owner/accept", "POST", undefined, friend);
  await page.goto(base + "/?collection=" + id + "#collections");
  await page
    .locator('[data-workspace-form="member"] select')
    .selectOption(friendId);
  await page.getByRole("button", { name: "允許共同編輯" }).click();
  await expect(
    page.getByRole("button", { name: "取消共同編輯" }),
  ).toBeVisible();
  const friendContext = await browser.newContext();
  await friendContext.addInitScript(
    (t) => sessionStorage.setItem("myzilla-token", t),
    friend,
  );
  const friendPage = await friendContext.newPage();
  await friendPage.goto(base + "/?collection=" + id + "#collections");
  await expect(
    friendPage.getByRole("button", { name: "加入連結", exact: true }),
  ).toBeVisible();
  await expect(
    friendPage.getByRole("button", { name: "預覽與分享" }),
  ).toHaveCount(0);
  await friendPage
    .getByRole("button", { name: "加入連結", exact: true })
    .click();
  const fd = friendPage.locator("#curation-dialog");
  await fd.locator('[name="url"]').fill("https://example.org/from-friend");
  await fd.locator('[name="title"]').fill("朋友推薦");
  await fd.getByRole("button", { name: "加入", exact: true }).click();
  await expect(fd).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "朋友推薦", exact: true }),
  ).toBeVisible();
  await mkdir("data/curation-evidence", { recursive: true });
  await page.screenshot({
    path: "data/curation-evidence/collection-desktop.png",
    fullPage: true,
  });
  for (const path of [
    "/",
    "/#inbox",
    "/?collection=" + id + "#collections",
    "/?audience=friends#collections",
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + path);
    await page.locator("[data-workspace]").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "mobile overflow: " + path,
    );
  }
  await page.goto(base);
  await page.locator("[data-workspace]").waitFor();
  await page.screenshot({
    path: "data/curation-evidence/home-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.screenshot({
    path: "data/curation-evidence/home-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.equal(
    (await call("/api/report?from=0&to=9999999999999")).visitCount,
    50,
  );
  console.log(
    "PASS: topic selection, collection, notes, reorder, preview/share/revoke, history capture, undo, draft protection, collaboration, responsive layouts; source history unchanged",
  );
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => server.once("exit", r));
  await rm(temp, { recursive: true, force: true });
}
