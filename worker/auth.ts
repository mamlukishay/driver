/**
 * Optional accounts: Google sign-in (OAuth authorization code + PKCE, no library), the `tp_session`
 * cookie and the `/api/me` endpoints. Each account is one UserDO (`idFromName(<user key>)`).
 * Sign-in is optional and never gates group access (the trust model and X-Family-Id are unchanged).
 */
import type { Env } from "./env.ts";
import type { AccountGroup, MeResponse, SyncResponse } from "../shared/types.ts";
import {
  OAUTH_COOKIE,
  OAUTH_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  parseCookies,
  parseSession,
  profileFromIdToken,
  safeNext,
  userKey,
  validAccountGroup,
  validSyncBody,
} from "../shared/account.ts";
import { isSlug } from "../shared/slug.ts";
import { ApiError, NO_STORE, isObj, json, readJson } from "./http.ts";
import { randomToken } from "./user-do.ts";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const FAILED = "/?login=failed";

const googleOn = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * Fake sign-in for local dev and e2e. Needs `AUTH_DEV_LOGIN === "1"` (set only by vite.config.ts in
 * `vite dev` when the shell has it; never in wrangler.jsonc or the deploy workflow) AND a localhost host.
 */
export function devLoginOn(env: Env, url: URL): boolean {
  return env.AUTH_DEV_LOGIN === "1" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/** `features.accounts` in /api/config. */
export const accountsOn = (env: Env, url: URL) => googleOn(env) || devLoginOn(env, url);

const userStub = (env: Env, key: string) => env.USER.get(env.USER.idFromName(key));

/* ---------- cookies ---------- */

function cookie(name: string, value: string, maxAge: number, path = "/"): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

const sessionCookie = (key: string, token: string) => cookie(SESSION_COOKIE, `${key}.${token}`, SESSION_MAX_AGE);
const clearSession = () => cookie(SESSION_COOKIE, "", 0);
const clearOauth = () => cookie(OAUTH_COOKIE, "", 0, "/auth");

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, ...NO_STORE });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

/** The session from the request's cookie (not yet checked against the UserDO). */
function session(request: Request): { key: string; token: string } | null {
  return parseSession(parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE]);
}

/* ---------- base64url / PKCE ---------- */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function s256(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/* ---------- /auth/* ---------- */

export async function handleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const m = request.method;
  if (path === "/auth/google" && m === "GET") return start(env, url);
  if (path === "/auth/google/callback" && m === "GET") return callback(request, env, url);
  if (path === "/auth/dev-login" && m === "GET") return devLogin(env, url);
  if (path === "/auth/logout" && m === "POST") return logout(request, env);
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

async function start(env: Env, url: URL): Promise<Response> {
  const next = safeNext(url.searchParams.get("next"));
  if (!googleOn(env)) {
    // Dev: the same button signs in a fixed fake user, so the UI flow is testable without Google.
    if (devLoginOn(env, url)) return redirect(`/auth/dev-login?sub=dev-user&name=${encodeURIComponent("משתמש בדיקה")}&next=${encodeURIComponent(next)}`);
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  const state = randomToken();
  const verifier = randomToken() + randomToken();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${url.origin}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: await s256(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const flow = encodeURIComponent(JSON.stringify({ state, verifier, next }));
  return redirect(`${GOOGLE_AUTH}?${params}`, [cookie(OAUTH_COOKIE, flow, OAUTH_MAX_AGE, "/auth")]);
}

async function callback(request: Request, env: Env, url: URL): Promise<Response> {
  const fail = () => redirect(FAILED, [clearOauth()]);
  if (!googleOn(env)) return fail();
  let flow: { state?: unknown; verifier?: unknown; next?: unknown };
  try {
    flow = JSON.parse(decodeURIComponent(parseCookies(request.headers.get("Cookie"))[OAUTH_COOKIE] ?? ""));
  } catch {
    return fail();
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code || typeof flow.state !== "string" || typeof flow.verifier !== "string") return fail();
  if (url.searchParams.get("state") !== flow.state) return fail();

  let idToken: unknown;
  try {
    const r = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${url.origin}/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
    });
    if (!r.ok) {
      console.error("google token exchange failed", r.status);
      return fail();
    }
    idToken = ((await r.json()) as { id_token?: unknown }).id_token;
  } catch (e) {
    console.error("google token exchange error", e);
    return fail();
  }
  if (typeof idToken !== "string") return fail();
  let payload: unknown;
  try {
    // Straight from Google's token endpoint over TLS, so the signature needs no check for this flow.
    payload = JSON.parse(b64urlDecode(idToken.split(".")[1] ?? ""));
  } catch {
    return fail();
  }
  const profile = profileFromIdToken(payload, env.GOOGLE_CLIENT_ID!, Date.now());
  const key = profile && userKey("g", profile.sub);
  if (!profile || !key) return fail();
  let token: string;
  try {
    token = await userStub(env, key).signIn(profile);
  } catch (e) {
    console.error("account sign-in error", e);
    return fail();
  }
  return redirect(safeNext(flow.next), [sessionCookie(key, token), clearOauth()]);
}

async function devLogin(env: Env, url: URL): Promise<Response> {
  if (!devLoginOn(env, url)) return new Response("Not found", { status: 404, headers: NO_STORE });
  const sub = url.searchParams.get("sub") ?? "dev-user";
  const key = userKey("dev", sub);
  if (!key) return redirect(FAILED);
  const name = (url.searchParams.get("name") ?? sub).slice(0, 80);
  const token = await userStub(env, key).signIn({ sub, name, email: `${sub}@example.test` });
  return redirect(safeNext(url.searchParams.get("next")), [sessionCookie(key, token)]);
}

async function logout(request: Request, env: Env): Promise<Response> {
  const s = session(request);
  if (s) await userStub(env, s.key).signOut(s.token);
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSession(), ...NO_STORE } });
}

/* ---------- /api/me ---------- */

/** `/api/me`, `/api/me/sync`, `/api/me/groups/:group`. `seg` = path segments starting at "api". */
export async function handleMe(request: Request, env: Env, seg: string[]): Promise<Response> {
  const m = request.method;
  const s = session(request);
  const stub = s ? userStub(env, s.key) : null;

  if (seg.length === 2 && m === "GET") {
    const me = stub && s ? await stub.me(s.token) : null;
    return json(me ?? ({ user: null, groups: [] } satisfies MeResponse));
  }
  if (seg[2] === "sync" && seg.length === 3 && m === "POST") {
    const groups = validSyncBody(await readJson(request));
    if (!groups) throw new ApiError("invalid");
    const merged = stub && s ? await stub.sync(s.token, groups) : null;
    if (!merged) throw new ApiError("unauthorized");
    return json({ groups: merged } satisfies SyncResponse);
  }
  if (seg[2] === "groups" && seg.length === 4) {
    const group = seg[3]!;
    if (!isSlug(group)) throw new ApiError("invalid");
    if (m === "PUT") {
      const body = await readJson(request);
      const entry: AccountGroup | null = isObj(body) ? validAccountGroup({ ...body, group }) : null;
      if (!entry) throw new ApiError("invalid");
      if (!(stub && s && (await stub.putGroup(s.token, entry)))) throw new ApiError("unauthorized");
      return json({ ok: true });
    }
    if (m === "DELETE") {
      if (!(stub && s && (await stub.deleteGroup(s.token, group)))) throw new ApiError("unauthorized");
      return json({ ok: true });
    }
  }
  throw new ApiError("not_found");
}
