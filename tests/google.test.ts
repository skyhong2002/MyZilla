import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createApp } from "../src/server/app";
import { Registry } from "../src/accounts/registry";
import { googleConfig } from "../src/accounts/google";
const master = "oauth-test-master-token-more-than-32-characters";
const origin = "https://myzilla.test";
const config = {
  origin,
  clientId: "fixture.apps.googleusercontent.com",
  clientSecret: "fixture-secret",
};
function fixture() {
  const db = new DatabaseSync(":memory:");
  let payload: any;
  let challenge = "";
  let calls = 0;
  const app = createApp(
    db,
    master,
    "combined",
    config,
    async (code, verifier) => {
      calls++;
      assert.equal(
        createHash("sha256").update(verifier).digest("base64url"),
        challenge,
      );
      if (code === "invalid-signature")
        throw new Error("Invalid token signature");
      return payload;
    },
  );
  const registry = new Registry(db, master);
  const cookie = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const begin = async (token?: string) => {
    const r = token
      ? await app.request("/api/community/google/link", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        })
      : await app.request("/auth/google/start");
    const url = new URL(
      token ? (await r.json()).url : r.headers.get("location")!,
    );
    challenge = url.searchParams.get("code_challenge")!;
    payload = {
      sub: "google-owner",
      email: "owner@example.test",
      email_verified: true,
      nonce: url.searchParams.get("nonce"),
      aud: config.clientId,
      iss: "https://accounts.google.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    return { r, url, cookie: cookie(r), state: url.searchParams.get("state")! };
  };
  const callback = (
    flow: Awaited<ReturnType<typeof begin>>,
    code = "valid",
    browser = flow.cookie,
  ) =>
    app.request(`/auth/google/callback?state=${flow.state}&code=${code}`, {
      headers: { cookie: browser },
    });
  const finish = (r: Response, from = origin) =>
    app.request("/auth/google/session", {
      method: "POST",
      headers: { cookie: cookie(r), origin: from },
    });
  return {
    db,
    app,
    registry,
    begin,
    callback,
    finish,
    cookie,
    mutate: (fields: any) => Object.assign(payload, fields),
    calls: () => calls,
  };
}
test("Google config is optional and requires a fixed HTTPS origin when enabled", () => {
  assert.equal(googleConfig({}), undefined);
  assert.throws(() => googleConfig({ GOOGLE_CLIENT_ID: "x" }));
  assert.throws(() =>
    googleConfig({
      GOOGLE_CLIENT_ID: "x",
      GOOGLE_CLIENT_SECRET: "y",
      PUBLIC_ORIGIN: "https://example.test/path",
    }),
  );
});
test("Google linking preserves the owner identity and produces a one-use, cookie-bound session without URL tokens", async () => {
  const f = fixture();
  try {
    const before = f.db.prepare("SELECT count(*) AS n FROM events").get()!.n;
    const flow = await f.begin(master);
    assert.equal(flow.url.origin, "https://accounts.google.com");
    assert.equal(
      flow.url.searchParams.get("redirect_uri"),
      origin + "/auth/google/callback",
    );
    assert.equal(flow.url.searchParams.get("scope"), "openid email profile");
    assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
    assert.match(flow.r.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(flow.r.headers.get("set-cookie")!, /Secure/);
    const result = await f.callback(flow);
    assert.equal(
      result.headers.get("location"),
      "/community.html?google_complete=1",
    );
    assert.equal((await f.finish(result, "https://attacker.test")).status, 403);
    const session = await f.finish(result);
    assert.equal(session.status, 200);
    const { token } = await session.json();
    assert.equal(f.registry.authenticate(`Bearer ${token}`)?.id, "owner");
    assert.equal((await f.finish(result)).status, 401);
    assert.match(
      (await f.callback(flow)).headers.get("location")!,
      /error=state/,
    );
    assert.equal(f.calls(), 1);
    const again = await f.begin();
    const login = await f.callback(again);
    assert.equal((await f.finish(login)).status, 200);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM events").get()!.n,
      before,
    );
    const me = await f.app.request("/api/community/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal((await me.json()).googleEmail, "owner@example.test");
  } finally {
    f.db.close();
  }
});
test("unknown Google identities cannot claim existing history or silently register", async () => {
  const f = fixture();
  try {
    const flow = await f.begin();
    assert.match(
      (await f.callback(flow)).headers.get("location")!,
      /error=unlinked/,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM google_identities").get()!.n,
      0,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM accounts").get()!.n,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("state requires the same browser; linking rejects anonymous and sync-device credentials", async () => {
  const f = fixture();
  try {
    assert.equal(
      (await f.app.request("/api/community/google/link", { method: "POST" }))
        .status,
      401,
    );
    const device = f.registry.credential("owner", "device");
    assert.equal(
      (
        await f.app.request("/api/community/google/link", {
          method: "POST",
          headers: { authorization: `Bearer ${device}` },
        })
      ).status,
      403,
    );
    const flow = await f.begin(master);
    assert.match(
      (await f.callback(flow, "valid", "wrong=cookie")).headers.get(
        "location",
      )!,
      /error=state/,
    );
    assert.equal(f.calls(), 0);
    assert.match(
      (await f.callback(flow)).headers.get("location")!,
      /complete=1/,
    );
  } finally {
    f.db.close();
  }
});
test("invalid signature, nonce, issuer, audience, expiration and unverified email cannot link", async () => {
  for (const fields of [
    { nonce: "wrong" },
    { iss: "https://evil.test" },
    { aud: "other" },
    { exp: 1 },
    { email_verified: false },
    { azp: "another-client" },
  ]) {
    const f = fixture();
    try {
      const flow = await f.begin(master);
      f.mutate(fields);
      assert.match(
        (await f.callback(flow)).headers.get("location")!,
        /error=invalid/,
      );
      assert.equal(
        f.db.prepare("SELECT count(*) AS n FROM google_identities").get()!.n,
        0,
      );
    } finally {
      f.db.close();
    }
  }
  const f = fixture();
  try {
    const flow = await f.begin(master);
    assert.match(
      (await f.callback(flow, "invalid-signature")).headers.get("location")!,
      /error=failed/,
    );
  } finally {
    f.db.close();
  }
});
test("Google identity cannot be linked to two accounts; linking requires a still-valid original session", async () => {
  const f = fixture();
  try {
    const flow = await f.begin(master);
    await f.callback(flow);
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    f.db
      .prepare("INSERT INTO accounts(id,handle,name) VALUES(?,?,?)")
      .run(id, "friend", "Friend");
    const token = f.registry.credential(id);
    const second = await f.begin(token);
    assert.match(
      (await f.callback(second)).headers.get("location")!,
      /error=linked/,
    );
    const third = await f.begin(token);
    f.mutate({ sub: "another-google" });
    f.db.prepare("DELETE FROM credentials WHERE account=?").run(id);
    assert.match(
      (await f.callback(third)).headers.get("location")!,
      /error=expired/,
    );
    assert.equal(
      f.db.prepare("SELECT account FROM google_identities").get()!.account,
      "owner",
    );
  } finally {
    f.db.close();
  }
});
test("Google cancellation consumes the flow without contacting the provider", async () => {
  const f = fixture();
  try {
    const flow = await f.begin();
    const r = await f.app.request(
      `/auth/google/callback?state=${flow.state}&error=access_denied`,
      { headers: { cookie: flow.cookie } },
    );
    assert.match(r.headers.get("location")!, /error=cancelled/);
    assert.equal(f.calls(), 0);
    assert.match(
      (await f.callback(flow)).headers.get("location")!,
      /error=state/,
    );
  } finally {
    f.db.close();
  }
});

test("expired OAuth state and completion handoffs cannot be replayed", async () => {
  const f = fixture();
  const realNow = Date.now;
  try {
    const flow = await f.begin(master);
    const started = realNow();
    Date.now = () => started + 600001;
    assert.match(
      (await f.callback(flow)).headers.get("location")!,
      /error=state/,
    );
    Date.now = realNow;
    const next = await f.begin(master);
    const result = await f.callback(next);
    Date.now = () => realNow() + 61000;
    assert.equal((await f.finish(result)).status, 401);
  } finally {
    Date.now = realNow;
    f.db.close();
  }
});
