import type { Context, Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { createHash } from "node:crypto";
import { Registry, digest, secret } from "./registry";

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  origin: string;
};
export type GoogleExchange = (
  code: string,
  verifier: string,
) => Promise<TokenPayload & { nonce?: string }>;
export function googleConfig(env: NodeJS.ProcessEnv): GoogleConfig | undefined {
  if (!env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) return;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.PUBLIC_ORIGIN)
    throw new Error(
      "Google login requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and PUBLIC_ORIGIN",
    );
  const url = new URL(env.PUBLIC_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== env.PUBLIC_ORIGIN)
    throw new Error(
      "PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash",
    );
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    origin: url.origin,
  };
}
export function registerGoogle(
  app: Hono,
  registry: Registry,
  config?: GoogleConfig,
  exchangeOverride?: GoogleExchange,
) {
  const db = registry.db;
  app.get("/auth/google/config", (c) => c.json({ enabled: Boolean(config) }));
  if (!config) return;
  const callback = config.origin + "/auth/google/callback";
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: callback,
    transporterOptions: { timeout: 15000, retry: false },
  });
  const exchange: GoogleExchange =
    exchangeOverride ??
    (async (code, verifier) => {
      const { tokens } = await client.getToken({
        code,
        codeVerifier: verifier,
      });
      if (!tokens.id_token) throw new Error("Missing identity token");
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error("Missing verified identity");
      return payload;
    });
  type Flow = {
    browser: string;
    nonce: string;
    verifier: string;
    expires: number;
    auth?: string;
  };
  const flows = new Map<string, Flow>();
  const handoffs = new Map<string, { account: string; expires: number }>();
  const cookie = "__Host-myzilla-google-state";
  const finishCookie = "__Host-myzilla-google-finish";
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
    path: "/",
  };
  const clean = () => {
    for (const [key, flow] of flows)
      if (flow.expires <= Date.now()) flows.delete(key);
    for (const [key, flow] of handoffs)
      if (flow.expires <= Date.now()) handoffs.delete(key);
  };
  function start(c: Context, auth?: string) {
    clean();
    if (flows.size >= 500) return undefined;
    const state = secret(),
      browser = secret(),
      nonce = secret(),
      verifier = secret();
    const previous = getCookie(c, cookie);
    if (previous)
      for (const [key, flow] of flows)
        if (flow.browser === digest(previous)) flows.delete(key);
    flows.set(digest(state), {
      browser: digest(browser),
      nonce,
      verifier,
      expires: Date.now() + 600000,
      auth,
    });
    setCookie(c, cookie, browser, { ...cookieOptions, maxAge: 600 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config!.clientId,
      redirect_uri: callback,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url.toString();
  }
  app.get("/auth/google/start", (c) => {
    const url = start(c);
    return url ? c.redirect(url, 302) : c.json({ error: "請稍後再試" }, 429);
  });
  app.post("/api/community/google/link", (c) => {
    const linked = db
      .prepare("SELECT subject FROM google_identities WHERE account=?")
      .get(c.get("account").id);
    if (linked) return c.json({ error: "此帳號已連結 Google" }, 409);
    const url = start(c, c.req.header("Authorization"));
    return url ? c.json({ url }) : c.json({ error: "請稍後再試" }, 429);
  });
  const fail = (c: Context, reason: string) =>
    c.redirect(`/community.html?google_error=${reason}`, 303);
  app.get("/auth/google/callback", async (c) => {
    clean();
    const state = c.req.query("state") ?? "";
    const flow = flows.get(digest(state));
    if (!flow || flow.browser !== digest(getCookie(c, cookie) ?? ""))
      return fail(c, "state");
    flows.delete(digest(state));
    deleteCookie(c, cookie, cookieOptions);
    if (c.req.query("error")) return fail(c, "cancelled");
    const code = c.req.query("code");
    if (!code || code.length > 8192) return fail(c, "invalid");
    try {
      const identity = await exchange(code, flow.verifier);
      if (
        identity.nonce !== flow.nonce ||
        identity.aud !== config.clientId ||
        !["https://accounts.google.com", "accounts.google.com"].includes(
          identity.iss,
        ) ||
        identity.exp * 1000 <= Date.now() ||
        !identity.sub ||
        identity.sub.length > 255 ||
        identity.email_verified !== true ||
        !identity.email ||
        (identity.azp && identity.azp !== config.clientId)
      )
        return fail(c, "invalid");
      let account: string;
      const existing = db
        .prepare("SELECT account FROM google_identities WHERE subject=?")
        .get(identity.sub);
      if (flow.auth) {
        const owner = registry.authenticate(flow.auth);
        if (!owner || owner.credential === "device") return fail(c, "expired");
        if (existing && existing.account !== owner.id) return fail(c, "linked");
        const current = db
          .prepare("SELECT subject FROM google_identities WHERE account=?")
          .get(owner.id);
        if (current && current.subject !== identity.sub)
          return fail(c, "linked");
        db.prepare(
          "INSERT INTO google_identities(subject,account,email) VALUES(?,?,?) ON CONFLICT(subject) DO UPDATE SET email=excluded.email",
        ).run(identity.sub, owner.id, identity.email);
        account = owner.id;
      } else {
        if (!existing) return fail(c, "unlinked");
        account = existing.account as string;
        db.prepare("UPDATE google_identities SET email=? WHERE subject=?").run(
          identity.email,
          identity.sub,
        );
      }
      const handoff = secret();
      handoffs.set(digest(handoff), { account, expires: Date.now() + 60000 });
      setCookie(c, finishCookie, handoff, { ...cookieOptions, maxAge: 60 });
      return c.redirect("/community.html?google_complete=1", 303);
    } catch {
      // Never include provider tokens, authorization codes or secrets in logs/errors.
      return fail(c, "failed");
    }
  });
  app.post("/auth/google/session", (c) => {
    if (c.req.header("Origin") !== config.origin)
      return c.json({ error: "登入來源不符" }, 403);
    clean();
    const key = digest(getCookie(c, finishCookie) ?? "");
    const handoff = handoffs.get(key);
    handoffs.delete(key);
    deleteCookie(c, finishCookie, cookieOptions);
    if (!handoff) return c.json({ error: "登入已逾時，請重新登入" }, 401);
    return c.json({ token: registry.credential(handoff.account) });
  });
}
