import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "myzilla-usability-"));
const base = "http://127.0.0.1:18148",
  token = "usability-fixture-owner-token-not-production-12345";
const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "18148",
    MYZILLA_DB: join(temp, "test.sqlite"),
    MYZILLA_TOKEN: token,
  },
  stdio: "pipe",
});
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
async function api(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  return r.json();
}
let browser;
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await api("/api/community/claim", "POST", {
    handle: "fixture-owner",
    name: "Fixture owner",
    password: "fixture-password-12345",
  });
  const invitation = (await api("/api/community/invitations", "POST"))
    .invitation;
  const outsider = await api("/auth/register", "POST", {
    handle: "other",
    name: "Other",
    password: "fixture-password-12345",
    invitation,
  });
  const item = {
    kind: "bookmark",
    title: "保留的收藏",
    url: "https://example.test/keep",
    scope: "work",
    tags: ["測試"],
    notes: "原有筆記",
    visibility: "private",
  };
  const id = randomUUID();
  await api("/api/portal/items/" + id, "PUT", item);
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1000 },
  });
  await context.addInitScript(
    (token) => sessionStorage.setItem("myzilla-token", token),
    token,
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Slow page entry must show the signed-in shell immediately, without a global processing toast or login flash.
  await context.addInitScript(() => {
    window.__loginFlashes = [];
    new MutationObserver(() => {
      const forms = [
        ...document.querySelectorAll(
          '[data-form="unlock"],[data-form="login"],#connect-form',
        ),
      ];
      if (forms.some((el) => el.checkVisibility()))
        window.__loginFlashes.push(location.pathname);
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
  });
  for (const path of ["/", "/community.html", "/dashboard.html"]) {
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await page.goto(base + path);
    await expect(
      page.getByRole("button", { name: "登出", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(650);
    await expect(page.locator("#ux-toast")).toHaveCount(0);
    assert.deepEqual(
      await page.evaluate(() => window.__loginFlashes),
      [],
      path,
    );
    if (path === "/") {
      await page
        .locator("aside")
        .getByRole("link", { name: "我的電影", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "新增電影", exact: true }),
      ).toBeVisible();
      await expect(page.locator("h1")).toHaveText("我的電影");
    } else if (path.includes("community"))
      await expect(page.locator("[data-form=profile]")).toBeVisible();
    else await expect(page.locator("#visits-stat")).toHaveText("0");
    await page.unrouteAll({ behavior: "wait" });
  }
  // An invalid session still returns to login after server rejection.
  const invalid = await browser.newPage();
  await invalid.addInitScript(() =>
    sessionStorage.setItem(
      "myzilla-token",
      "invalid-fixture-token-123456789012345",
    ),
  );
  for (const path of ["/", "/community.html", "/dashboard.html"]) {
    await invalid.goto(base + path);
    await expect(
      invalid.locator('[data-form="unlock"],[data-form="login"],#connect-form'),
    ).toBeVisible();
  }
  await invalid.close();
  await page.goto(base + "/#bookmark");
  await expect(
    page.getByRole("heading", { name: item.title, exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-action=previous]")).toBeDisabled();
  await expect(page.locator("[data-action=next]")).toBeDisabled();
  await page.keyboard.press("/");
  await expect(page.locator("#find-query")).toBeFocused();
  await page.locator("#find-query").fill("不存在");
  await page.locator("[data-form=find] button").click();
  await expect(page.locator(".filter-summary")).toContainText("不存在");
  await page.getByRole("button", { name: "清除篩選", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: item.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "編輯", exact: true }).click();
  const editor = page.locator("#editor");
  await editor.locator("[name=notes]").fill("尚未儲存的內容");
  await page.keyboard.press("Escape");
  await expect(page.locator(".ux-confirm")).toContainText("放棄尚未儲存");
  await expect(page.locator(".ux-confirm [data-cancel]")).toBeFocused();
  await page.locator(".ux-confirm [data-cancel]").click();
  await expect(editor.locator("[name=notes]")).toHaveValue("尚未儲存的內容");
  await editor.locator("[name=url]").fill("ftp://example.test/invalid");
  await editor.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(editor.locator("[name=url]")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(editor.locator("#field-error-url")).toContainText("http://");
  await expect(editor.locator("[name=url]")).toBeFocused();
  await editor.locator("[name=url]").fill(item.url);
  // Slow failed save must announce status and preserve input, and cannot double-submit.
  let saves = 0;
  const saveRoute = `**/api/portal/items/${id}`;
  await page.route(saveRoute, async (route) => {
    saves++;
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: "{}",
    });
  });
  await editor.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(editor.locator(".ux-inline-status")).toContainText("正在處理");
  await expect(editor.locator("[name=notes]")).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "儲存", exact: true }),
  ).toBeDisabled();
  await expect(editor.locator("[role=alert]")).toContainText("稍後重試");
  await expect(editor.locator("[name=notes]")).toHaveValue("尚未儲存的內容");
  assert.equal(saves, 1);
  await page.unroute(saveRoute);
  // Expired session: in-place reauthentication rejects a different account.
  await page.route(
    saveRoute,
    (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"error":"unauthorized"}',
      }),
    { times: 1 },
  );
  await editor.getByRole("button", { name: "儲存", exact: true }).click();
  const reauth = page.locator(".ux-confirm");
  await expect(reauth).toContainText("登入已過期");
  await reauth.getByText("使用原始存取金鑰", { exact: true }).click();
  await reauth.locator("[name=token]").fill(outsider.token);
  await reauth.getByRole("button", { name: "驗證金鑰", exact: true }).click();
  await expect(reauth.locator("[role=alert]")).toContainText("不是原本的帳號");
  await reauth.locator("[name=token]").fill(token);
  await reauth.getByRole("button", { name: "驗證金鑰", exact: true }).click();
  await expect(reauth).toHaveCount(0);
  await expect(editor.locator("[name=notes]")).toHaveValue("尚未儲存的內容");
  await editor.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByText("尚未儲存的內容", { exact: true })).toBeVisible();
  // Delete confirmation, undo and a durable recovery entry after dismissal.
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  await page.locator(".ux-confirm [data-cancel]").click();
  assert.equal((await api("/api/portal/items")).total, 1);
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  await page.locator(".ux-confirm [data-confirm]").click();
  await expect(page.locator("#ux-toast")).toContainText("收藏已刪除");
  await page.getByRole("button", { name: "復原收藏", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: item.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  await page.locator(".ux-confirm [data-confirm]").click();
  await page.getByRole("button", { name: "關閉通知", exact: true }).click();
  await page
    .locator("aside")
    .getByRole("link", { name: "匯入與工具", exact: true })
    .click();
  await page.getByRole("button", { name: "復原收藏", exact: true }).click();
  await expect(
    page.getByText("目前沒有可復原的收藏。", { exact: true }),
  ).toBeVisible();
  assert.equal(
    (await api("/api/portal/items")).items[0].notes,
    "尚未儲存的內容",
  );
  // Import preview discloses replacements and friend-visible rows; cancellation writes nothing.
  const backup = {
    version: 1,
    items: [
      { ...item, id, title: "更新項目", visibility: "friends" },
      ...Array.from({ length: 3 }, (_, i) => ({
        ...item,
        id: randomUUID(),
        title: "匯入 " + i,
      })),
    ],
  };
  await page.locator("[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "匯入全部項目", exact: true }).click();
  await expect(page.locator(".ux-confirm")).toContainText(
    "1 筆會更新現有項目，1 筆會分享",
  );
  await page.locator(".ux-confirm [data-cancel]").click();
  assert.equal((await api("/api/portal/items")).total, 1);
  assert.equal((await api("/api/portal/items")).items[0].visibility, "private");
  await page.route("**/api/portal/items/*", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });
  await page.getByRole("button", { name: "匯入全部項目", exact: true }).click();
  await page.locator(".ux-confirm [data-confirm]").click();
  await page.getByRole("button", { name: "停止匯入", exact: true }).click();
  await expect(page.locator("#notice")).toContainText(
    "匯入已停止：接受 1、拒收 0、未處理 3",
  );
  await page.unroute("**/api/portal/items/*");
  // Last-page deletion clamps page and does not leave an empty out-of-range result.
  for (let i = 0; i < 20; i++)
    await api("/api/portal/items/" + randomUUID(), "PUT", {
      ...item,
      title: "頁碼 " + i,
    });
  await page.goto(base + "/?offset=20#bookmark");
  await expect(page.locator(".item")).toHaveCount(1);
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  await page.locator(".ux-confirm [data-confirm]").click();
  await expect(page.locator(".item")).toHaveCount(20);
  await expect(page.locator("[data-action=previous]")).toBeDisabled();
  await expect(page.locator("[data-action=next]")).toBeDisabled();
  // Browser Back must not discard a draft.
  await page
    .locator("aside")
    .getByRole("link", { name: "我的電影", exact: true })
    .click();
  await page.getByRole("button", { name: "新增電影", exact: true }).click();
  await editor.locator("[name=title]").fill("未儲存電影");
  await page.evaluate(() => history.back());
  await expect(page.locator(".ux-confirm")).toContainText("放棄尚未儲存");
  await page.locator(".ux-confirm [data-cancel]").click();
  await expect(editor.locator("[name=title]")).toHaveValue("未儲存電影");
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await page.locator(".ux-confirm [data-confirm]").click();
  // Help is searchable and all page headers expose the same primary destinations.
  await page.getByRole("link", { name: "使用說明", exact: true }).click();
  await page.locator("#help-search").fill("相鄰造訪間隔");
  await expect(page.locator("#help-status")).toContainText("找到 1");
  await expect(page.locator("#time")).toBeVisible();
  await page.getByRole("link", { name: "登入", exact: true }).click();
  await expect(page.locator("#help-search")).toHaveValue("");
  await expect(page.locator("#login h2")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "data/usability-help-mobile.png",
    fullPage: false,
  });
  // Credential changes require confirmation; copy failures provide a manual fallback.
  const oldKey = (await api("/api/community/device-token", "POST")).token;
  await page.goto(base + "/community.html");
  await page
    .getByRole("button", { name: "建立／更換同步金鑰", exact: true })
    .click();
  await expect(page.locator(".ux-confirm")).toContainText("每個瀏覽器設定檔");
  await page.locator(".ux-confirm [data-cancel]").click();
  assert.equal(
    (
      await fetch(base + "/api/sources", {
        headers: { authorization: `Bearer ${oldKey}` },
      })
    ).status,
    200,
  );
  await page
    .getByRole("button", { name: "建立／更換同步金鑰", exact: true })
    .click();
  await page.locator(".ux-confirm [data-confirm]").click();
  await expect(page.locator("#community-message")).toContainText("同步金鑰（");
  assert.equal(
    (
      await fetch(base + "/api/sources", {
        headers: { authorization: `Bearer ${oldKey}` },
      })
    ).status,
    401,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw Error("fixture denied");
        },
      },
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "複製", exact: true }).click();
  await expect(page.locator(".ux-confirm textarea")).toBeFocused();
  assert.ok(
    (await page.locator(".ux-confirm textarea").inputValue()).length >= 32,
  );
  await page
    .locator(".ux-confirm")
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  // Isolated dashboard: preserve controls and recover from transient fetch failure.
  await page.goto(base + "/dashboard.html#recap");
  await expect(page.locator("#dwell-threshold")).toBeVisible();
  await page.route("**/api/dwell?*", (route) => route.abort("failed"), {
    times: 1,
  });
  await page.locator("#dwell-threshold").selectOption("60");
  await expect(page.locator("[data-dwell-retry]")).toBeVisible();
  await expect(page.locator("#dwell-threshold")).toBeVisible();
  await page.locator("[data-dwell-retry]").click();
  await expect(page.locator("[data-dwell-retry]")).toHaveCount(0);
  await page.locator(".page-nav [data-view=insights]").click();
  await page.route("**/api/insights?*", (route) => route.abort("failed"), {
    times: 1,
  });
  await page.locator("[data-jump=changes]").click();
  await expect(page.locator("[data-insight-retry]")).toBeVisible();
  await page.locator("[data-insight-retry]").click();
  await expect(page.locator("#insight-changes")).toBeVisible();
  await expect(page.locator("[data-insight-retry]")).toHaveCount(0);
  await page.locator(".page-nav [data-view=history]").click();
  await expect(page.locator("#previous")).toBeDisabled();
  await expect(page.locator("#next")).toBeDisabled();
  await page.route("**/api/visits?*", (route) => route.abort("failed"), {
    times: 1,
  });
  await page.locator("#search").fill("失敗搜尋");
  await expect(page.locator("[data-history-retry]")).toBeVisible();
  await page.locator("[data-history-retry]").click();
  await expect(page.locator("[data-history-retry]")).toHaveCount(0);
  await page.getByRole("button", { name: "清除搜尋", exact: true }).click();
  await expect(page.locator("#search")).toBeFocused();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "data/usability-dashboard-mobile.png",
    fullPage: false,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: signed-in page entry without login flashes or global loading toasts, responsive navigation during reads, slow/failing/expired requests, same-account recovery, draft cancellation and Back, deletion undo/expiry entry, import preview/cancel/stop, last-page recovery, disabled controls, keyboard/focus, searchable help, retry and mobile layout",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await rm(temp, { recursive: true, force: true });
}
