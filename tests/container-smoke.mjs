import { execFileSync } from "node:child_process";
const name = `myzilla-smoke-${process.pid}`;
execFileSync("docker", [
  "run",
  "--rm",
  "-d",
  "--name",
  name,
  "-e",
  "MYZILLA_DB=:memory:",
  "-e",
  "MYZILLA_TOKEN=architecture-test-token-not-a-production-secret",
  process.argv[2] ?? "myzilla:check",
]);
try {
  execFileSync(
    "docker",
    [
      "exec",
      name,
      "node",
      "--input-type=module",
      "-e",
      `
    const root = 'http://127.0.0.1:18140';
    for (let i=0;i<30;i++) { try { await fetch(root+'/health'); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
    for (const [path, status] of [['/health',200],['/',200],['/api/sources',401],['/downloads/import_history.py',200]]) {
      const r=await fetch(root+path); if(r.status!==status) throw Error(path+': '+r.status);
    }
    const headers={authorization:'Bearer architecture-test-token-not-a-production-secret'};
    const r=await fetch(root+'/api/report?from=0&to=1000',{headers});
    if(r.status!==200||(await r.json()).visitCount!==0) throw Error('private report failed');
    console.log('PASS: non-root container, UI, downloads, health, auth and private report');
  `,
    ],
    { stdio: "inherit" },
  );
} finally {
  execFileSync("docker", ["stop", name]);
}
