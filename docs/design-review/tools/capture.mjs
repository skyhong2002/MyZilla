// Photograph every state in states.mjs at both sizes, one browser at a time.
//   node capture.mjs site http://127.0.0.1:PORT TOKENS_JSON OUT_DIR [id-filter]
//   node capture.mjs references OUT_DIR [id-filter]
// Needs playwright resolvable (NODE_PATH or a local node_modules).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SIZES, STATES, REFERENCES, NOW, DIGEST, IMPORT_FILE } from "./states.mjs";

const [mode, ...rest] = process.argv.slice(2);
const only = process.env.ONLY_SIZE;
const browser = await chromium.launch();

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
}
async function shoot(page, file, size, { viewportOnly } = {}) {
  if (viewportOnly) return page.screenshot({ path: file });
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  const height = Math.max(size.height, Math.min(full, size.maxHeight));
  await page.setViewportSize({ width: size.width, height });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.screenshot({ path: file });
}
function contextOptions(size, extra = {}) {
  return {
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.deviceScaleFactor,
    isMobile: !!size.isMobile,
    hasTouch: !!size.hasTouch,
    timezoneId: "Asia/Taipei",
    reducedMotion: "reduce",
    ...extra,
  };
}
async function runStep(page, step) {
  if (step.wait) return page.waitForTimeout(step.wait);
  if (step.file) {
    const file = join(tmpdir(), "myzilla-review-import.json");
    writeFileSync(file, JSON.stringify(IMPORT_FILE));
    return page.locator('input[type="file"]').first().setInputFiles(file);
  }
  if (step.fill) return page.locator(step.fill.selector).fill(step.fill.value);
  const c = step.click;
  const target = c.role
    ? page.getByRole(c.role, { name: c.name, exact: true })
    : c.text
      ? page.getByText(c.text, { exact: true })
      : page.locator(c.selector);
  await target.first().click({ timeout: 8000 });
}

if (mode === "site") {
  const [base, tokensFile, out, filter] = rest;
  const tokens = JSON.parse(readFileSync(tokensFile, "utf8"));
  mkdirSync(out, { recursive: true });
  for (const [sizeName, size] of Object.entries(SIZES).filter(([n]) => !only || n === only)) {
    for (const state of STATES.filter((s) => !filter || s.id.includes(filter))) {
      const context = await browser.newContext(
        contextOptions(size, { colorScheme: state.theme === "dark" ? "dark" : "light", locale: "zh-TW" }),
      );
      const account = state.account ?? "owner";
      if (account !== "none")
        await context.addInitScript((t) => sessionStorage.setItem("myzilla-token", t), tokens[account]);
      // No request leaves the machine: external links, favicons and the AI digest are local fixtures.
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.fulfill({ status: 204, body: "" });
        const api = url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/");
        if (api && state.api === "loading") return; // never answers
        if (api && state.api === "error") return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
        if (url.pathname === "/api/favicon") return route.fulfill({ json: { icon: null } });
        if (url.pathname === "/auth/google/config") return route.fulfill({ json: { enabled: true } });
        if (url.pathname === "/api/digest")
          return route.fulfill({ json: account === "owner" ? DIGEST : { digest: null } });
        const method = route.request().method();
        if (state.fake && url.pathname.startsWith("/api/portal/items/") && ["PUT", "DELETE"].includes(method)) {
          if (state.fake === "hang") return;
          return route.fulfill({ json: { ok: true } });
        }
        return route.continue();
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(NOW));
      const path = state.path.replace("{trip}", tokens.trip);
      await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      if (state.api === "loading") await page.waitForTimeout(1500);
      else {
        await settle(page);
        for (const step of state.steps ?? [])
          await runStep(page, step).catch((e) => console.warn(state.id, "step failed", JSON.stringify(step), e.message.split("\n")[0]));
        await page.waitForTimeout(state.fake === "hang" ? 1200 : 600);
      }
      const file = `${out}/${state.id}_${sizeName}.png`;
      await shoot(page, file, size, state);
      console.log(file);
      await context.close();
    }
  }
} else if (mode === "references") {
  const [out, filter] = rest;
  mkdirSync(out, { recursive: true });
  for (const [sizeName, size] of Object.entries(SIZES).filter(([n]) => !only || n === only)) {
    for (const ref of REFERENCES.filter((r) => !filter || r.id.includes(filter))) {
      const context = await browser.newContext(
        contextOptions(size, {
          locale: "zh-TW",
          userAgent: size.isMobile
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        }),
      );
      const page = await context.newPage();
      await page.goto(ref.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(7000);
      for (const name of ["Reject All", "Reject all", "Accept All", "Accept all", "Accept", "Got it"]) {
        const button = page.getByRole("button", { name, exact: true });
        if (await button.count().catch(() => 0)) {
          await button.first().click({ timeout: 2000 }).catch(() => {});
          break;
        }
      }
      await settle(page);
      const file = `${out}/${ref.id}_${sizeName}.png`;
      await shoot(page, file, size, {});
      console.log(file);
      await context.close();
    }
  }
}
await browser.close();
