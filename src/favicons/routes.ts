import type { Hono } from "hono";
import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix);
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
export function publicAddress(address: string) {
  if (isIP(address) === 4) return !blocked.check(address);
  return (
    isIP(address) === 6 &&
    globalIPv6.check(address, "ipv6") &&
    !blocked.check(address, "ipv6")
  );
}
export function faviconHost(value: string) {
  if (!value || value.length > 253 || /[^a-zA-Z0-9.\-]/.test(value))
    return null;
  const host = value.toLowerCase().replace(/\.$/, "");
  if (
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.split(".").some((s) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)) ||
    (isIP(host) && !publicAddress(host))
  )
    return null;
  return host;
}
export function imageData(body: Buffer) {
  let mime = "";
  if (
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = "image/png";
  else if (body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])))
    mime = "image/x-icon";
  else if (body[0] === 255 && body[1] === 216 && body[2] === 255)
    mime = "image/jpeg";
  else if (/^GIF8[79]a/.test(body.subarray(0, 6).toString()))
    mime = "image/gif";
  else if (
    body.subarray(0, 4).toString() === "RIFF" &&
    body.subarray(8, 12).toString() === "WEBP"
  )
    mime = "image/webp";
  return mime ? `data:${mime};base64,${body.toString("base64")}` : null;
}
async function download(url: URL, redirects = 0): Promise<Buffer> {
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    !faviconHost(url.hostname)
  )
    throw Error("Unsupported icon URL");
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(Error("DNS timeout")), 3000);
      t.unref();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("Private icon host");
  const address = addresses.find((a) => a.family === 4) ?? addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the validated IP; hostname still supplies TLS SNI and certificate verification.
    const req = get(
      url,
      {
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        family: address.family,
        agent: false,
        headers: {
          "User-Agent": "MyZilla-Favicon/1.0",
          Accept: "image/*,text/html;q=0.5",
        },
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 3) return reject(Error("Icon redirect limit"));
          try {
            resolve(
              download(new URL(res.headers.location, url), redirects + 1),
            );
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error("Icon unavailable"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 256 * 1024) req.destroy(Error("Icon too large"));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    const timer = setTimeout(() => req.destroy(Error("Icon timeout")), 5000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}
async function discover(host: string) {
  const origin = `https://${host}`;
  try {
    const icon = imageData(await download(new URL(origin + "/favicon.ico")));
    if (icon) return icon;
  } catch {}
  try {
    const html = (await download(new URL(origin + "/"))).toString("utf8");
    const candidates: string[] = [];
    for (const tag of html.match(/<link\b[^>]{0,2000}>/gi) ?? []) {
      const attrs = Object.fromEntries(
        [
          ...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g),
        ].map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]]),
      );
      if (
        /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attrs.rel ?? "") &&
        attrs.href
      )
        candidates.push(attrs.href);
    }
    for (const href of candidates.slice(0, 3)) {
      try {
        const icon = imageData(
          await download(new URL(href.replaceAll("&amp;", "&"), origin)),
        );
        if (icon) return icon;
      } catch {}
    }
  } catch {}
  return null;
}
export function registerFavicons(app: Hono, fetchIcon = discover) {
  const cache = new Map<
    string,
    { expires: number; value: Promise<string | null> }
  >();
  let active = 0;
  app.get("/api/favicon", async (c) => {
    const host = faviconHost(c.req.query("host") ?? "");
    if (!host) return c.json({ icon: null }, 400);
    let entry = cache.get(host);
    if (!entry || entry.expires < Date.now()) {
      if (active >= 8) return c.json({ icon: null }, 429);
      if (cache.size >= 512) cache.delete(cache.keys().next().value!);
      active++;
      entry = {
        expires: Date.now() + 86400000,
        value: Promise.resolve()
          .then(() => fetchIcon(host))
          .catch(() => null)
          .finally(() => {
            active--;
          }),
      };
      cache.set(host, entry);
      const current = entry;
      void entry.value.then((icon) => {
        if (!icon) current.expires = Date.now() + 300000;
      });
    }
    return c.json({ icon: await entry.value });
  });
}
