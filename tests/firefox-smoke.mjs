import { firefox } from "@playwright/test";
import { connect } from "../node_modules/web-ext/lib/firefox/remote.js";
import { mkdtemp, rm, cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "myzilla-firefox-"));
const extension = join(temporary, "extension");
let context;
let remote;
let timeout;
let nativeProcess;
let apiProcess;
const token = "firefox-smoke-test-secret-".repeat(3);
let resolveResult;
const result = new Promise((resolve) => {
  resolveResult = resolve;
});
const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    response.end("ok");
    resolveResult(JSON.parse(body));
  });
});
await new Promise((resolve) => server.listen(18144, "127.0.0.1", resolve));
try {
  apiProcess = spawn(
    process.execPath,
    ["--import", "tsx", "src/server/index.ts"],
    {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "18145",
        MYZILLA_DB: join(temporary, "test.sqlite"),
        MYZILLA_TOKEN: token,
      },
      stdio: "pipe",
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:18145/health")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await cp(resolve("dist/firefox"), extension, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions = ["http://127.0.0.1/*"];
  manifest.background.scripts.push("test-open.js");
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
  await writeFile(
    join(extension, "test-open.js"),
    `browser.runtime.onInstalled.addListener(() => { browser.tabs.create({ url: browser.runtime.getURL('index.html') }); });`,
  );
  const html = await readFile(join(extension, "index.html"), "utf8");
  await writeFile(
    join(extension, "index.html"),
    html.replace("</body>", '<script src="/test-harness.js"></script></body>'),
  );
  await writeFile(
    join(extension, "test-harness.js"),
    `
(async () => {
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  try {
    for (let i=0; i<100 && !document.querySelector('#capture-status')?.textContent.includes('已暫停'); i++) await wait();
    if (!document.querySelector('#capture-status')?.textContent.includes('已暫停')) throw new Error('Extension UI did not initialize: '+document.body.innerText);
    const command = async (type, extra = {}) => { const result = await browser.runtime.sendMessage({type, ...extra}); if (!result.ok) throw new Error(result.error); return result.data; };
    const tab=await browser.tabs.create({url:'http://127.0.0.1:18145/health',active:false});
    for(let i=0;i<100;i++){ const loaded=await browser.tabs.get(tab.id); if(loaded.status==='complete' && loaded.url==='http://127.0.0.1:18145/health')break; await wait(); }
    const selected=await command('collect-tabs');
    if(!selected.items.some(t=>t.url==='http://127.0.0.1:18145/health'))throw new Error('Firefox tab collection missing page');
    await browser.tabs.remove(tab.id);
    await command('toggle');
    await browser.history.addUrl({url:'https://example.org/firefox-live', title:'Firefox live fixture', visitTime:Date.now()});
    await wait(); await command('toggle');
    await browser.history.addUrl({url:'https://example.org/firefox-old',title:'Ancient Firefox fixture',visitTime:Date.now()-4*365*86400000});
    await command('import');
    for (let i=0; i<200; i++) { const state = await browser.storage.local.get('importJob'); if(state.importJob?.running===false) break; await wait(); }
    const request=indexedDB.open('myzilla',1);
    const db=await new Promise(resolve=>{request.onsuccess=()=>resolve(request.result);});
    const query=db.transaction('events').objectStore('events').getAll();
    const records=await new Promise(resolve=>{query.onsuccess=()=>resolve(query.result);});
    if (!records.some(r=>r.event.url.includes('firefox-live'))) throw new Error('Live Firefox history missing');
    if (!records.some(r=>r.event.url.includes('firefox-old'))) throw new Error('Full Firefox history import missing old visit: '+JSON.stringify(await browser.storage.local.get(['importStatus','importJob']))+' visits='+JSON.stringify(await browser.history.getVisits({url:'https://example.org/firefox-old'})));
    location.hash = 'settings';
    await command('save', {server:'http://127.0.0.1:18145', token:${JSON.stringify(token)}, browser:'Firefox fixture', profile:'Isolated', device:'Fixture device'});
    await command('sync');
    const status = await command('status');
    if (status.pending !== 0) throw new Error('Firefox outbox did not drain');
    await fetch('http://127.0.0.1:18144/result',{method:'POST',body:JSON.stringify({ok:true,records:records.length})});
  } catch(error) { await fetch('http://127.0.0.1:18144/result',{method:'POST',body:JSON.stringify({ok:false,error:error.message})}); }
})();`,
  );
  const prefs = {
    "devtools.debugger.remote-enabled": true,
    "devtools.debugger.prompt-connection": false,
    "devtools.chrome.enabled": true,
    "browser.shell.checkDefaultBrowser": false,
    "browser.startup.homepage_override.mstone": "ignore",
    "zen.welcome-screen.seen": true,
  };
  if (process.env.ZEN_BINARY) {
    const profile = join(temporary, "profile");
    await mkdir(profile);
    await writeFile(
      join(profile, "user.js"),
      Object.entries(prefs)
        .map(
          ([key, value]) =>
            `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
        )
        .join("\n"),
    );
    nativeProcess = spawn(
      process.env.ZEN_BINARY,
      [
        "--headless",
        "--no-remote",
        "--profile",
        profile,
        "--start-debugger-server",
        "18142",
      ],
      { stdio: "ignore" },
    );
  } else
    context = await firefox.launchPersistentContext(
      join(temporary, "profile"),
      {
        headless: true,
        args: ["--start-debugger-server", "18142"],
        firefoxUserPrefs: prefs,
      },
    );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      remote = await connect(18142);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(remote);
  await remote.installTemporaryAddon(extension);
  const outcome = await Promise.race([
    result,
    new Promise((resolve) => {
      timeout = setTimeout(
        () => resolve({ ok: false, error: "Firefox extension test timed out" }),
        45000,
      );
    }),
  ]);
  assert.equal(outcome.ok, true, outcome.error);
  const sources = await (
    await fetch("http://127.0.0.1:18145/api/sources", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.ok(
    sources.sources.some(
      (source) => source.kind === "visit" && source.count >= 2,
    ),
  );
  console.log(
    `PASS: ${process.env.ZEN_BINARY ? "Zen" : "Firefox"} add-on, UI initialization, live history capture, pause and full import of four-year-old visit and authenticated synchronization`,
  );
} finally {
  clearTimeout(timeout);
  remote?.disconnect();
  await context?.close();
  if (nativeProcess) {
    nativeProcess.kill("SIGTERM");
    if (nativeProcess.exitCode === null)
      await new Promise((resolve) => nativeProcess.once("exit", resolve));
  }
  server.close();
  if (apiProcess) {
    apiProcess.kill("SIGTERM");
    if (apiProcess.exitCode === null)
      await new Promise((resolve) => apiProcess.once("exit", resolve));
  }
  await rm(temporary, { recursive: true, force: true });
}
