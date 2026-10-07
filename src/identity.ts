/**
 * Which family this browser acts as, per group: `{ [groupSlug]: familyId }` in localStorage under
 * `trempush.identities`. No secrets: anyone with the group link may pick any family. Always try/catch.
 */

const IDS_KEY = "trempush.identities";
const BROWSE_KEY = "trempush.browse";

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
  save({ ...allIdentities(), [group]: familyId });
}

/** "התנתקות מהטלפון הזה", or the server no longer knows the family. */
export function removeIdentity(group: string): void {
  const all = { ...allIdentities() };
  if (!(group in all)) return;
  delete all[group];
  save(all);
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
