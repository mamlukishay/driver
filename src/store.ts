/** Tiny stale-while-revalidate cache shared by screens, so back/forward renders instantly. */
import { useEffect } from "preact/hooks";
import type { EventView, GroupResponse, KidView } from "../shared/types.ts";
import { api, ApiError } from "./api.ts";
import type { ClientErrorCode } from "./i18n/he.ts";
import { onIdentityChange } from "./identity.ts";
import { useForce } from "./util.ts";

interface Entry<T> {
  data?: T;
  error?: ClientErrorCode;
  loading: boolean;
  fetcher: () => Promise<T>;
  subs: Set<() => void>;
  inflight?: Promise<void>;
}

const cache = new Map<string, Entry<unknown>>();

export const keys = {
  group: (g: string) => `group:${g}`,
  event: (g: string, e: string) => `event:${g}:${e}`,
  kid: (g: string, t: string, e?: string) => (e ? `kid:${g}:${t}:e:${e}` : `kid:${g}:${t}`),
};

function entry<T>(key: string, fetcher: () => Promise<T>): Entry<T> {
  let e = cache.get(key) as Entry<T> | undefined;
  if (!e) {
    e = { loading: false, fetcher, subs: new Set() };
    cache.set(key, e as Entry<unknown>);
  } else {
    e.fetcher = fetcher;
  }
  return e;
}

const notify = (e: Entry<unknown>) => e.subs.forEach((s) => s());

export function refetch(key: string): Promise<void> {
  const e = cache.get(key);
  if (!e) return Promise.resolve();
  if (e.inflight) return e.inflight;
  e.loading = true;
  notify(e);
  e.inflight = e
    .fetcher()
    .then((d) => {
      e.data = d;
      e.error = undefined;
    })
    .catch((err: unknown) => {
      e.error = err instanceof ApiError ? err.code : "unknown";
    })
    .finally(() => {
      e.loading = false;
      e.inflight = undefined;
      notify(e);
    });
  return e.inflight;
}

export function setData<T>(key: string, data: T): void {
  const e = cache.get(key);
  if (!e) return;
  e.data = data;
  e.error = undefined;
  notify(e);
}

export function peek<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/** Keys currently rendered by some screen and belonging to a group (used by live.ts). */
export function activeKeys(group: string): string[] {
  const out: string[] = [];
  for (const [k, e] of cache) {
    if (e.subs.size > 0 && (k.startsWith(`group:${group}`) || k.startsWith(`event:${group}:`) || k.startsWith(`kid:${group}:`)))
      out.push(k);
  }
  return out;
}

// When the identity changes (register, import, key dropped), everything visible must be refetched.
// A request already in flight was made with the old identity (e.g. the very request whose 403 got the key
// dropped), so wait for it to settle and fetch again instead of reusing its result.
onIdentityChange(() => {
  for (const [k, e] of cache) {
    if (e.subs.size === 0) continue;
    if (e.inflight) void e.inflight.then(() => refetch(k));
    else void refetch(k);
  }
});

export interface Resource<T> {
  data: T | undefined;
  error: ClientErrorCode | undefined;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useResource<T>(key: string | null, fetcher: () => Promise<T>): Resource<T> {
  const force = useForce();
  const e = key ? entry(key, fetcher) : null;
  useEffect(() => {
    if (!key || !e) return;
    e.subs.add(force);
    void refetch(key);
    return () => {
      e.subs.delete(force);
    };
  }, [key]);
  return {
    data: e?.data,
    error: e?.error,
    loading: e ? e.loading || (!e.data && !e.error) : false,
    reload: () => (key ? refetch(key) : Promise.resolve()),
  };
}

export const useGroup = (g: string) => useResource<GroupResponse>(keys.group(g), () => api.getGroup(g));
export const useEvent = (g: string, ev: string) =>
  useResource<EventView>(keys.event(g, ev), () => api.getEvent(g, ev));
export const useKid = (g: string, t: string, e?: string) =>
  useResource<KidView>(keys.kid(g, t, e), () => api.getKid(g, t, e));
