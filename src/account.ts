/**
 * The optional account (Google sign-in). Loaded once at startup when `features.accounts` is on: signed in →
 * this device's groups are merged into the account (`POST /api/me/sync`) and the merged list is written back
 * into `identity.ts`, so "הקבוצות שלי" shows every group the account has. After that, identity changes are
 * sent fire-and-forget (see `setAccountHooks`). Signing out keeps this device's list as it is.
 */
import { useEffect } from "preact/hooks";
import type { AccountUser } from "../shared/types.ts";
import { api } from "./api.ts";
import { localAccountGroups, mergeFromAccount, setAccountHooks } from "./identity.ts";
import { useForce } from "./util.ts";

export interface AccountState {
  /** Accounts are configured on the server (`features.accounts`). */
  enabled: boolean;
  /** `/api/me` answered (until then nothing account-related is shown). */
  loaded: boolean;
  user: AccountUser | null;
}

let state: AccountState = { enabled: false, loaded: false, user: null };
const listeners = new Set<() => void>();

function set(next: AccountState): void {
  state = next;
  listeners.forEach((l) => l());
}

export const accountState = (): AccountState => state;

export function onAccountChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The account state; re-renders on change. */
export function useAccount(): AccountState {
  const force = useForce();
  useEffect(() => onAccountChange(force), []);
  return state;
}

const ignore = () => {};

let started = false;

/** Called once from main.tsx. */
export function initAccount(): void {
  if (started) return;
  started = true;
  setAccountHooks({
    put(group, familyId, lastUsed) {
      if (!state.user) return false;
      api.putAccountGroup(group, familyId, lastUsed).catch(ignore);
      return true;
    },
    remove(group) {
      if (state.user) api.deleteAccountGroup(group).catch(ignore);
    },
  });
  void refreshAccount();
}

/** (Re)loads the account; when signed in, syncs this device's groups both ways. */
export async function refreshAccount(): Promise<void> {
  const cfg = await api.getConfig();
  if (!cfg.features.accounts) {
    set({ enabled: false, loaded: true, user: null });
    return;
  }
  try {
    const me = await api.me();
    if (!me.user) {
      set({ enabled: true, loaded: true, user: null });
      return;
    }
    set({ enabled: true, loaded: true, user: me.user });
    mergeFromAccount(me.groups);
    const synced = await api.syncGroups(localAccountGroups());
    mergeFromAccount(synced.groups);
  } catch {
    // Offline or the session ended: show the signed-out state only if we know nothing better.
    set({ ...state, enabled: true, loaded: true });
  }
}

/** Full navigation to Google sign-in, returning to `next` (a path on this site). */
export function signIn(next = location.pathname + location.search): void {
  location.assign(`/auth/google?next=${encodeURIComponent(next)}`);
}

/** Ends this browser's session; the groups stay on this device. */
export async function signOut(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* offline: still forget it here */
  }
  set({ ...state, user: null });
  await refreshAccount();
}
