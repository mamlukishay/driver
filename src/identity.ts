/** Device identities: which family this browser acts as, per group. localStorage, always try/catch. */
import type { FamilyInput } from "../shared/types.ts";

export interface Identity {
  familyId: string;
  /** `<familyId>.<secret>`, sent as X-Family-Key. */
  key: string;
  familyName: string;
  color: number;
  /** Cached for the home screen. */
  groupName?: string;
}

const IDS_KEY = "trempush.identities";
const PROFILE_KEY = "trempush.lastProfile";

type Listener = () => void;
const listeners = new Set<Listener>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: identity lives only for this page view */
  }
}

/** In-memory mirror so the app keeps working when storage is blocked. */
let memory: Record<string, Identity> | null = null;

export function allIdentities(): Record<string, Identity> {
  if (!memory) memory = read<Record<string, Identity>>(IDS_KEY, {});
  return memory;
}

export function getIdentity(groupId: string): Identity | null {
  return allIdentities()[groupId] ?? null;
}

export function setIdentity(groupId: string, id: Identity): void {
  const all = { ...allIdentities(), [groupId]: id };
  memory = all;
  write(IDS_KEY, all);
  listeners.forEach((l) => l());
}

export function updateIdentity(groupId: string, patch: Partial<Identity>): void {
  const cur = getIdentity(groupId);
  if (cur) setIdentity(groupId, { ...cur, ...patch });
}

export function onIdentityChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The most recent family profile, used to pre-fill joining another group. Ids are stripped. */
export function getLastProfile(): FamilyInput | null {
  return read<FamilyInput | null>(PROFILE_KEY, null);
}

export function setLastProfile(p: FamilyInput): void {
  write(PROFILE_KEY, {
    name: p.name,
    address: p.address,
    parents: p.parents.map((x) => ({ name: x.name, phone: x.phone })),
    kids: p.kids.map((k) => ({ name: k.name, ...(k.phone ? { phone: k.phone } : {}) })),
    cars: p.cars.map((c) => ({
      label: c.label,
      seats: c.seats,
      ...(c.color ? { color: c.color } : {}),
      ...(c.plate ? { plate: c.plate } : {}),
    })),
  } satisfies FamilyInput);
}

/**
 * Reads `#<familyId>.<secret>` from the URL (the devices magic link), then clears the hash with
 * replaceState so the key doesn't linger in the address bar. Returns the key, or null.
 */
export function importFromFragment(): string | null {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  let key: string;
  try {
    key = decodeURIComponent(hash);
  } catch {
    key = hash;
  }
  try {
    history.replaceState(history.state, "", location.pathname + location.search);
  } catch {
    /* ignore */
  }
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) ? key : null;
}

/** Drops this device's identity for a group (e.g. the server rejected the key). */
export function removeIdentity(groupId: string): void {
  const all = { ...allIdentities() };
  if (!(groupId in all)) return;
  delete all[groupId];
  memory = all;
  write(IDS_KEY, all);
  listeners.forEach((l) => l());
}
