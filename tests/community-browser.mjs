import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "myzilla-community-"));
const token = "community-browser-owner-token-fixture-only";
const port = 18143,
  base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    MYZILLA_DB: join(temporary, "test.sqlite"),
    MYZILLA_TOKEN: token,
  },
  stdio: "pipe",
});
let browser;
const password = "fixture-password-at-least-12";
async function api(path, credential, body) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}
async function submit(page, form, values, button) {
  for (const [name, value] of Object.entries(values))
    await page.locator(`[data-form="${form}"] [name="${name}"]`).fill(value);
  await page
    .locator(`[data-form="${form}"]`)
    .getByRole("button", { name: button, exact: true })
    .click();
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const errors = [];
  for (const page of [owner, guest])
    page.on("pageerror", (e) => errors.push(e.message));
  await owner.goto(base + "/community.html");
  await submit(owner, "legacy", { token }, "使用金鑰開啟");
  await owner.locator('[data-form="claim"]').waitFor();
  await submit(
    owner,
    "claim",
    { handle: "owner-test", name: "Owner fixture", password },
    "建立帳號並登入",
  );
  await owner.getByText("@owner-test", { exact: true }).waitFor();
  await owner.getByRole("button", { name: "產生邀請碼" }).click();
  await owner.waitForFunction(() =>
    document
      .querySelector("#community-message")
      .textContent.includes("一次性邀請碼"),
  );
  const invitation = (await owner.locator("#community-message").innerText())
    .split("：")
    .at(-1);
  await guest.goto(base + "/community.html");
  await guest.getByText("收到加入邀請？建立帳號", { exact: true }).click();
  await submit(
    guest,
    "register",
    { handle: "friend-test", name: "Friend fixture", password, invitation },
    "建立私人帳號",
  );
  await guest.getByText("@friend-test", { exact: true }).waitFor();
  const guestToken = await guest.evaluate(() =>
    sessionStorage.getItem("myzilla-token"),
  );
  const batch = {
    deviceId: "2b9b1f4a-245e-4562-a1f8-a88834916f63",
    source: {
      browser: "Zen",
      profile: "Fixture",
      device: "Fixture",
      method: "native",
    },
    events: [
      {
        kind: "visit",
        id: "fixture-1",
        url: "https://github.com/private-secret",
        title: "Private fixture",
        visitedAt: Date.now() - 1000,
        transition: "1",
      },
    ],
  };
  await api("/api/events", token, batch);
  await api("/api/events", guestToken, batch);
  for (const page of [owner, guest]) {
    await page.locator('[name="matching"]').check();
    await page.getByRole("button", { name: "儲存設定", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("#community-message")
        .textContent.includes("已儲存"),
    );
    await page.getByRole("link", { name: "朋友與配對", exact: true }).click();
  }
  await submit(owner, "friend", { handle: "friend-test" }, "送出朋友邀請");
  await owner.getByText("等待對方接受", { exact: true }).waitFor();
  await guest.reload();
  await guest.getByRole("button", { name: "接受", exact: true }).click();
  await guest.getByText("已是朋友", { exact: true }).waitFor();
  await guest.getByRole("heading", { name: /100% 分布相似度/ }).waitFor();
  assert.equal(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await guest.screenshot({
    path: "data/myzilla-community-mobile.png",
    fullPage: true,
  });
  await owner.getByRole("link", { name: "興趣分析", exact: true }).click();
  await owner.locator('[data-domain="github.com"]').selectOption("learning");
  await owner.waitForFunction(() =>
    document
      .querySelector("#community-message")
      .textContent.includes("分類已更新"),
  );
  await owner.getByText("自訂分類", { exact: false }).waitFor();
  await owner.getByRole("link", { name: "分享", exact: true }).click();
  await owner
    .getByRole("button", { name: "建立分享連結", exact: true })
    .click();
  await owner.waitForFunction(() =>
    document
      .querySelector("#community-message")
      .textContent.includes("/share/"),
  );
  const share = (await owner.locator("#community-message").innerText())
    .split("：")
    .slice(1)
    .join("：");
  const publicPage = await browser.newPage();
  await publicPage.goto(share);
  assert.ok(
    !(await publicPage.locator("body").innerText()).includes("github.com"),
  );
  await owner.getByRole("button", { name: "撤銷分享", exact: true }).click();
  await owner
    .locator(".ux-confirm")
    .getByRole("button", { name: "撤銷分享", exact: true })
    .click();
  await owner.getByText("目前沒有有效的分享連結。", { exact: true }).waitFor();
  assert.equal((await publicPage.reload()).status(), 404);
  await owner.getByRole("link", { name: "帳號", exact: true }).click();
  await owner.screenshot({
    path: "data/myzilla-community-desktop.png",
    fullPage: true,
  });
  await guest.getByRole("button", { name: "登出", exact: true }).click();
  await guest.locator('[data-form="login"]').waitFor();
  await submit(guest, "login", { handle: "friend-test", password }, "登入");
  await guest.getByRole("heading", { name: /Friend fixture 的空間/ }).waitFor();
  await guest.getByRole("link", { name: "瀏覽回顧", exact: true }).click();
  await guest.waitForFunction(
    () => document.querySelector("#visits-stat")?.textContent === "1",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: owner claim, invitation registration, account login, mutual friendship/consent, match, category edit, public share/revoke, mobile layout and own-history dashboard",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await rm(temporary, { recursive: true, force: true });
}
