/**
 * Pure helpers for optional accounts (Google sign-in): validating and merging the saved group lists,
 * the post-login `next` path, cookies and the Google id_token claims. No DOM, no Workers APIs.
 */
import type { AccountGroup, AccountUser } from "./types.ts";
import { isId } from "./ids.ts";
import { isSlug } from "./slug.ts";

/** Most groups one account keeps (the least recently used drop off). */
export const MAX_ACCOUNT_GROUPS = 200;

export const SESSION_COOKIE = "tp_session";
export const OAUTH_COOKIE = "tp_oauth";
/** About a year. */
export const SESSION_MAX_AGE = 365 * 24 * 60 * 60;
export const OAUTH_MAX_AGE = 600;

/** One group entry from a client, or null when malformed. `lastUsed` is rounded; 0 = never opened. */
export function validAccountGroup(v: unknown): AccountGroup | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isSlug(o.group) || !isFamilyId(o.familyId)) return null;
  const t = o.lastUsed;
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return null;
  return { group: o.group, familyId: o.familyId, lastUsed: Math.round(t) };
}

/** Family ids are short random ids (`isId`); kept loose on length so older ids still pass. */
export const isFamilyId = (v: unknown): v is string => isId(v) && (v as string).length <= 32;

/** `POST /api/me/sync` body → its groups, or null when malformed or longer than the cap. */
export function validSyncBody(body: unknown): AccountGroup[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const list = (body as { groups?: unknown }).groups;
  if (!Array.isArray(list) || list.length > MAX_ACCOUNT_GROUPS) return null;
  const out: AccountGroup[] = [];
  for (const item of list) {
    const g = validAccountGroup(item);
    if (!g) return null;
    out.push(g);
  }
  return out;
}

/**
 * Merges two group lists: per group the entry with the newer `lastUsed` wins (a tie keeps `incoming`,
 * the device's choice). Most recently used first, at most `cap` entries.
 */
export function mergeAccountGroups(
  stored: readonly AccountGroup[],
  incoming: readonly AccountGroup[],
  cap = MAX_ACCOUNT_GROUPS,
): AccountGroup[] {
  const by = new Map<string, AccountGroup>();
  for (const g of stored) {
    const cur = by.get(g.group);
    if (!cur || g.lastUsed > cur.lastUsed) by.set(g.group, g);
  }
  for (const g of incoming) {
    const cur = by.get(g.group);
    if (!cur || g.lastUsed >= cur.lastUsed) by.set(g.group, g);
  }
  return [...by.values()].sort((a, b) => b.lastUsed - a.lastUsed || (a.group < b.group ? -1 : 1)).slice(0, cap);
}

/** Where to land after sign-in: a same-origin path starting with a single `/`, else `/`. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 500) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  // No control characters or backslashes (browsers treat `\` like `/`).
  for (const c of next) {
    const code = c.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || c === "\\") return "/";
  }
  return next;
}

/** `Cookie` header → name/value pairs (first occurrence wins; values are not decoded). */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

const USER_KEY_RE = /^(g|dev):[A-Za-z0-9_-]{1,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

/** The account key (the UserDO name): `g:<google sub>`, or `dev:<id>` for local dev login. */
export function userKey(provider: "g" | "dev", sub: string): string | null {
  const key = `${provider}:${sub}`;
  return USER_KEY_RE.test(key) ? key : null;
}

/** `tp_session` = `<user key>.<token>` → its parts, or null when malformed. */
export function parseSession(value: string | undefined): { key: string; token: string } | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const key = value.slice(0, i);
  const token = value.slice(i + 1);
  return USER_KEY_RE.test(key) && TOKEN_RE.test(token) ? { key, token } : null;
}

export const GOOGLE_ISSUERS: readonly string[] = ["accounts.google.com", "https://accounts.google.com"];

export interface Profile extends AccountUser {
  sub: string;
}

/**
 * The profile from a Google id_token payload (taken straight from Google's token endpoint over TLS),
 * or null when the issuer, audience, expiry or subject don't check out.
 */
export function profileFromIdToken(payload: unknown, clientId: string, nowMs: number): Profile | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.iss !== "string" || !GOOGLE_ISSUERS.includes(p.iss)) return null;
  const audOk = p.aud === clientId || (Array.isArray(p.aud) && p.aud.includes(clientId));
  if (!clientId || !audOk) return null;
  if (typeof p.exp === "number" && p.exp * 1000 < nowMs) return null;
  if (typeof p.sub !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(p.sub)) return null;
  const email = typeof p.email === "string" ? p.email.slice(0, 200) : "";
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 80) : email.split("@")[0] ?? "";
  const picture = typeof p.picture === "string" && p.picture.startsWith("https://") ? p.picture.slice(0, 500) : undefined;
  return { sub: p.sub, email, name, ...(picture ? { picture } : {}) };
}
