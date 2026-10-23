// Public entry, robots/sitemap and private-data isolation against the built web root.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "myzilla-seo-")),
  token = "public-seo-fixture-token-more-than-32-characters",
  base = "http://127.0.0.1:18146",
  origin = "https://myzilla.observe.tw",
  marker = "private-marker-" + randomUUID();
const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  env: {
    ...process.env,
    PORT: "18146",
    HOST: "127.0.0.1",
    MYZILLA_DB: join(temporary, "test.sqlite"),
    MYZILLA_TOKEN: token,
  },
  stdio: "pipe",
});
let browser;
const api = async (path, method, body) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok, `${method} ${path} ${r.status}`);
};
const get = async (path) => {
  const r = await fetch(base + path, { redirect: "manual" });
  return { status: r.status, headers: r.headers, body: await r.text() };
};
const canonical = (html) =>
  html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
try {
  let log = "";
  server.stderr.on("data", (d) => (log += d));
  // A loaded host can take well over ten seconds to start tsx.
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    if (i === 600) throw Error("server did not start\n" + log);
    await new Promise((r) => setTimeout(r, 100));
  }
  // Seed private history, a private bookmark and a search record carrying the marker.
  await api("/api/events", "POST", {
    deviceId: randomUUID(),
    source: {
      browser: "Zen",
      profile: "Default",
      device: "Fixture",
      method: "native",
    },
    events: [
      {
        kind: "visit",
        id: "visit:1",
        sourceVisitId: "1",
        url: `https://example.test/${marker}`,
        title: marker,
        visitedAt: Date.now() - 60_000,
        transition: "1",
      },
    ],
  });
  await api("/api/portal/items/" + randomUUID(), "PUT", {
    kind: "bookmark",
    title: marker,
    url: `https://example.test/bookmark/${marker}`,
    scope: "work",
    tags: [],
    notes: marker,
    visibility: "private",
  });
  await api("/api/portal/search", "POST", { engine: "google_tw", query: marker });

  const home = await get("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.equal(canonical(home.body), origin + "/");
  assert.match(home.body, /<meta\s+name="description"\s+content="[^"]{40,}"/);
  assert.match(home.body, /<h1>MyZilla · 我的個人入口<\/h1>/);
  assert.match(home.body, /id="product-intro"/);
  assert.doesNotMatch(home.body, /noindex/);
  assert.equal(canonical((await get("/index.html")).body), origin + "/");
  const help = await get("/help.html");
  assert.equal(help.status, 200);
  assert.equal(canonical(help.body), origin + "/help.html");
  assert.match(help.body, /<meta\s+name="description"/);
  for (const path of ["/dashboard.html", "/community.html"]) {
    const page = await get(path);
    assert.equal(page.status, 200);
    assert.match(page.body, /<meta name="robots" content="noindex"/);
    assert.equal(canonical(page.body), undefined);
  }

  const robots = await get("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type"), /text\/plain/);
  assert.match(robots.body, /^Sitemap: https:\/\/myzilla\.observe\.tw\/sitemap\.xml$/m);
  assert.match(robots.body, /^Disallow: \/api\/$/m);
  assert.match(robots.body, /^Disallow: \/auth\/$/m);
  assert.doesNotMatch(robots.body, /^Disallow: \/\s*$/m);
  const sitemap = await get("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /xml/);
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  // Only the originally public pages; each must be a 200 self-canonical page.
  assert.deepEqual(locs, [origin + "/", origin + "/help.html"]);
  for (const loc of locs) {
    const page = await get(new URL(loc).pathname);
    assert.equal(page.status, 200);
    assert.equal(canonical(page.body), loc);
    assert.doesNotMatch(page.body, /noindex/);
  }

  for (const path of ["/nope", "/nope.html", "/dashboard/history", "/s/unknown", "/share/unknown", "/collection/unknown"]) {
    const page = await get(path);
    assert.equal(page.status, 404, path);
    assert.ok(!page.body.includes(marker), path);
  }
  for (const path of [
    "/api/sources",
    `/api/visits?from=0&to=${Date.now()}`,
    `/api/report?from=0&to=${Date.now()}`,
    "/api/portal/items",
    "/api/portal/searches",
    "/api/portal/export",
    "/api/insights",
    "/api/digest",
    "/api/community/me",
  ]) {
    const page = await get(path);
    assert.equal(page.status, 401, path);
    assert.ok(!page.body.includes(marker), path);
  }
  for (const path of ["/", "/index.html", "/help.html", "/dashboard.html", "/community.html", "/robots.txt", "/sitemap.xml"])
    assert.ok(!(await get(path)).body.includes(marker), path);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/");
  await page.getByRole("heading", { name: "歡迎回到自己的入口" }).waitFor();
  await page.getByRole("heading", { name: "認識 MyZilla" }).waitFor();
  assert.equal(await page.locator("#product-intro").count(), 1);
  assert.equal(await page.locator("h1").count(), 1);
  assert.ok(!(await page.content()).includes(marker));
  // The legacy key entry still opens the private portal, which drops the public introduction.
  await page.getByText("使用既有存取金鑰", { exact: true }).click();
  await page.locator('[name="token"]').fill(token);
  await page.getByRole("button", { name: "開啟我的入口", exact: true }).click();
  await page.goto(base + "/#bookmark");
  await page.getByRole("heading", { name: marker, exact: true }).waitFor();
  assert.equal(await page.locator("#product-intro").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: crawlable public entry metadata and introduction, self-canonical sitemap of public pages, robots, noindex private shells, 404 unknown pages and anonymous private API isolation",
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(temporary, { recursive: true, force: true });
}
