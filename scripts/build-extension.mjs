import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
const webRoot = process.env.MYZILLA_WEB_BUILD ?? "dist/web";
for (const target of ["chromium", "firefox"]) {
  const dir = `dist/${target}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await cp(webRoot, dir, { recursive: true });
  await cp(`${webRoot}/dashboard.html`, `${dir}/index.html`);
  await rm(`${dir}/downloads`, { recursive: true, force: true });
  await build({
    entryPoints: ["src/extension/background.ts"],
    bundle: true,
    format: target === "firefox" ? "iife" : "esm",
    target: target === "firefox" ? "firefox140" : "chrome120",
    outfile: `${dir}/background.js`,
  });
  const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
  if (target === "firefox") {
    delete manifest.minimum_chrome_version;
    manifest.permissions = manifest.permissions.filter(
      (p) => p !== "tabGroups",
    );
    manifest.background = { scripts: ["background.js"] };
    manifest.browser_specific_settings = {
      gecko: {
        id: "myzilla@observe.tw",
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: ["browsingActivity", "searchTerms"],
        },
      },
      gecko_android: { strict_min_version: "142.0" },
    };
  }
  await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
}
await rm("dist/web/manifest.json", { force: true });
