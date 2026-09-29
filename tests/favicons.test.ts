import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { createApp } from "../src/server/app";
import {
  faviconHost,
  publicAddress,
  imageData,
  registerFavicons,
} from "../src/favicons/routes";

test("favicon requests require authentication and reject private/invalid hosts", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const token = "favicon-test-token-".repeat(3),
      app = createApp(db, token);
    assert.equal(
      (await app.request("/api/favicon?host=example.org")).status,
      401,
    );
    for (const host of [
      "127.0.0.1",
      "100.71.224.62",
      "localhost",
      "x.local",
      "example.org/private?token=x",
      "user@example.org",
      "example.org:8080",
    ]) {
      const response = await app.request(
        "/api/favicon?host=" + encodeURIComponent(host),
        { headers: { authorization: `Bearer ${token}` } },
      );
      assert.equal(response.status, 400, host);
    }
  } finally {
    db.close();
  }
});
test("favicon address checks exclude local, mapped, metadata and reserved networks", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2001:4860:4860::8888"), true);
  assert.equal(publicAddress("2001:0db8::1"), false);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  assert.equal(faviconHost("WWW.Example.org"), "www.example.org");
  assert.equal(faviconHost('example.org"><img'), null);
});
test("favicon content rejects HTML/SVG and coalesces concurrent requests", async () => {
  assert.equal(imageData(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(imageData(Buffer.from("<!doctype html>")), null);
  const icon = imageData(Buffer.from([0, 0, 1, 0, 1, 0]));
  assert.match(icon!, /^data:image\/x-icon;base64,/);
  const app = new Hono();
  let count = 0;
  registerFavicons(app, async (host) => {
    count++;
    assert.equal(host, "example.org");
    return icon;
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      app.request("/api/favicon?host=example.org"),
    ),
  );
  for (const result of results) assert.deepEqual(await result.json(), { icon });
  assert.equal(count, 1);
});
