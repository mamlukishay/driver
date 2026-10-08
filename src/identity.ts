/**
 * Which family this browser acts as, per group: `{ [groupSlug]: familyId }` in localStorage under
 * `trempush.identities`. No secrets: anyone with the group link may pick any family. Always try/catch.
 * When each group was last opened lives separately in `trempush.lastUsed` (`{ [groupSlug]: epochMs }`),
 * so the identities format stays unchanged.
 */
import { byLastUsed } from "../shared/myGroups.ts";

const IDS_KEY = "trempush.identities";
const BROWSE_KEY = "trempush.browse";
const LAST_KEY = "trempush.lastUsed";

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

/** In-memory mirror so the app keeps working when storage is blocked. */
let memory: Record<string, string> | null = null;

function load(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = JSON.parse(localStorage.getItem(IDS_KEY) ?? "{}") as Record<string, unknown>;
    for (const [g, v] of Object.entries(raw ?? {})) {
      // Older versions stored `{ familyId, key, … }`; keep just the family id.
      const id = typeof v === "string" ? v : v && typeof v === "object" ? (v as { familyId?: unknown }).familyId : null;
      if (typeof id === "string" && id) out[g] = id;
    }
  } catch {
    /* blocked or corrupt storage: start empty */
  }
  return out;
}

function save(all: Record<string, string>): void {
  memory = all;
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota: identity lives only for this page view */
  }
  emit();
}

export function allIdentities(): Record<string, string> {
  if (!memory) memory = load();
  return memory;
}

/** The family id this device acts as in `group`, or null. */
export function getIdentity(group: string): string | null {
  return allIdentities()[group] ?? null;
}

export function setIdentity(group: string, familyId: string): void {
  deleted.delete(group);
  touchGroup(group);
  save({ ...allIdentities(), [group]: familyId });
}

/** "התנתקות מהטלפון הזה", or the server no longer knows the family. */
export function removeIdentity(group: string): void {
  const all = { ...allIdentities() };
  if (!(group in all)) return;
  delete all[group];
  save(all);
}

/* ---------- deleted groups ---------- */

/** Groups seen deleted in this page view (live `{t:"deleted"}` or a 404 for a stored group). */
const deleted = new Set<string>();

export const isGroupDeleted = (group: string) => deleted.has(group);

/** Forgets everything this device keeps for a group: family, last-used time, "רק להסתכל". */
export function forgetGroup(group: string): void {
  if (lastUsedMap()[group] !== undefined) {
    const { [group]: _gone, ...rest } = lastUsedMap();
    lastUsed = rest;
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(lastUsed));
    } catch {
      /* private mode */
    }
  }
  setBrowsing(group, false);
  removeIdentity(group);
}

/** The group is gone for everyone: screens for it show "הקבוצה נמחקה" (they re-render via identity listeners). */
export function markGroupDeleted(group: string): void {
  if (deleted.has(group)) return;
  deleted.add(group);
  forgetGroup(group);
  emit();
}

/** A new group with this slug was just created here. */
export const clearGroupDeleted = (group: string) => void deleted.delete(group);

/* ---------- last used, per group (for "הקבוצות שלי" order and the join prefill) ---------- */

let lastUsed: Record<string, number> | null = null;

export function lastUsedMap(): Record<string, number> {
  if (!lastUsed) {
    lastUsed = {};
    try {
      const raw = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, unknown>;
      for (const [g, t] of Object.entries(raw ?? {})) if (typeof t === "number") lastUsed[g] = t;
    } catch {
      /* blocked or corrupt storage */
    }
  }
  return lastUsed;
}

/** Marks a group as just opened on this device. */
export function touchGroup(group: string): void {
  lastUsed = { ...lastUsedMap(), [group]: Date.now() };
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(lastUsed));
  } catch {
    /* private mode: order kept for this page view */
  }
}

/** Groups this device has a family in, most recently used first. */
export function myGroupsByLastUsed(): string[] {
  return byLastUsed(Object.keys(allIdentities()), lastUsedMap());
}

export function onIdentityChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ---------- "רק להסתכל": browse a group without choosing a family (this tab only) ---------- */

let browsing: Set<string> | null = null;

function browseSet(): Set<string> {
  if (!browsing) {
    try {
      browsing = new Set(JSON.parse(sessionStorage.getItem(BROWSE_KEY) ?? "[]") as string[]);
    } catch {
      browsing = new Set();
    }
  }
  return browsing;
}

export function isBrowsing(group: string): boolean {
  return browseSet().has(group);
}

export function setBrowsing(group: string, on: boolean): void {
  const s = browseSet();
  if (on) s.add(group);
  else s.delete(group);
  try {
    sessionStorage.setItem(BROWSE_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

/* ---------- the last driver picked in the car sheet, per group (`{ [groupSlug]: personId }`) ---------- */

const DRIVER_KEY = "trempush.lastDriver";

function lastDrivers(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DRIVER_KEY) ?? "{}") as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [g, v] of Object.entries(raw ?? {})) if (typeof v === "string") out[g] = v;
    return out;
  } catch {
    return {};
  }
}

/** Who last drove from this device in `group` ("מי נוהג/ת?" preselects them), or null. */
export function lastDriver(group: string): string | null {
  return lastDrivers()[group] ?? null;
}

export function setLastDriver(group: string, personId: string): void {
  try {
    localStorage.setItem(DRIVER_KEY, JSON.stringify({ ...lastDrivers(), [group]: personId }));
  } catch {
    /* private mode: no preselection next time */
  }
}
