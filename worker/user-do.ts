import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";
import type { AccountGroup, AccountUser, MeResponse } from "../shared/types.ts";
import { MAX_ACCOUNT_GROUPS, mergeAccountGroups, type Profile } from "../shared/account.ts";

/** Most sessions (signed-in browsers) one account keeps; the oldest is dropped beyond that. */
const MAX_SESSIONS = 50;

interface StoredGroup {
  familyId: string;
  lastUsed: number;
}

/** Hex SHA-256 of a session token: only the hash is stored. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes, base64url. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * One instance per signed-in person (`idFromName("g:<google sub>")`), called by the Worker over RPC.
 * KV storage: `profile` (sub, email, name, picture), `grp:<slug>` { familyId, lastUsed },
 * `sess:<sha256 of token>` { createdAt }. Every call but `signIn` takes the session token and checks it.
 */
export class UserDO extends DurableObject<Env> {
  /** Stores the profile and opens a session; returns the new session token. */
  async signIn(profile: Profile): Promise<string> {
    await this.ctx.storage.put("profile", profile);
    const token = randomToken();
    await this.ctx.storage.put(`sess:${await hashToken(token)}`, { createdAt: Date.now() });
    const sessions = await this.ctx.storage.list<{ createdAt: number }>({ prefix: "sess:" });
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      await this.ctx.storage.delete(oldest.slice(0, sessions.size - MAX_SESSIONS).map(([k]) => k));
    }
    return token;
  }

  async signOut(token: string): Promise<void> {
    await this.ctx.storage.delete(`sess:${await hashToken(token)}`);
  }

  /** The account and its groups, or null when the token is not a live session here. */
  async me(token: string): Promise<MeResponse | null> {
    if (!(await this.valid(token))) return null;
    const p = await this.ctx.storage.get<Profile>("profile");
    if (!p) return null;
    const user: AccountUser = { name: p.name, email: p.email, ...(p.picture ? { picture: p.picture } : {}) };
    return { user, groups: await this.groups() };
  }

  /** Merges this device's list in (newer `lastUsed` wins per group); returns the merged list, or null. */
  async sync(token: string, incoming: AccountGroup[]): Promise<AccountGroup[] | null> {
    if (!(await this.valid(token))) return null;
    const stored = await this.groups();
    const merged = mergeAccountGroups(stored, incoming);
    await this.write(stored, merged);
    return merged;
  }

  /** Upserts one group (the newer `lastUsed` is kept). False when the token is not a session. */
  async putGroup(token: string, entry: AccountGroup): Promise<boolean> {
    if (!(await this.valid(token))) return false;
    const stored = await this.groups();
    const cur = stored.find((g) => g.group === entry.group);
    const next = cur ? { ...entry, lastUsed: Math.max(cur.lastUsed, entry.lastUsed) } : entry;
    await this.write(stored, mergeAccountGroups(stored, [next], MAX_ACCOUNT_GROUPS));
    return true;
  }

  async deleteGroup(token: string, group: string): Promise<boolean> {
    if (!(await this.valid(token))) return false;
    await this.ctx.storage.delete(`grp:${group}`);
    return true;
  }

  private async valid(token: string): Promise<boolean> {
    return (await this.ctx.storage.get(`sess:${await hashToken(token)}`)) !== undefined;
  }

  private async groups(): Promise<AccountGroup[]> {
    const rows = await this.ctx.storage.list<StoredGroup>({ prefix: "grp:" });
    return [...rows.entries()].map(([k, v]) => ({ group: k.slice(4), familyId: v.familyId, lastUsed: v.lastUsed }));
  }

  /** Writes `next` over `prev`: changed rows are put, rows that fell off (the cap) are deleted. */
  private async write(prev: readonly AccountGroup[], next: readonly AccountGroup[]): Promise<void> {
    const before = new Map(prev.map((g) => [g.group, g]));
    const puts: Record<string, StoredGroup> = {};
    for (const g of next) {
      const b = before.get(g.group);
      if (!b || b.familyId !== g.familyId || b.lastUsed !== g.lastUsed) puts[`grp:${g.group}`] = { familyId: g.familyId, lastUsed: g.lastUsed };
      before.delete(g.group);
    }
    const dels = [...before.keys()].map((k) => `grp:${k}`);
    // storage.put(entries) takes at most 128 keys per call.
    const entries = Object.entries(puts);
    for (let i = 0; i < entries.length; i += 128) await this.ctx.storage.put(Object.fromEntries(entries.slice(i, i + 128)));
    for (let i = 0; i < dels.length; i += 128) await this.ctx.storage.delete(dels.slice(i, i + 128));
  }
}
