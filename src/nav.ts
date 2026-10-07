/**
 * History helpers: per-entry keys for scroll restoration, sheets in `?sheet=`, and a back button
 * that walks history when it can (so iOS swipe-back and our button agree).
 */
import { useLocation } from "preact-iso";
import { useLayoutEffect, useRef } from "preact/hooks";

interface EntryState {
  k: string;
  /** URL of the entry we pushed from, when this entry was pushed inside the app. */
  prev?: string;
}

const SCROLL_KEY = "trempush.scroll";
let scrolls: Record<string, number> = {};
try {
  scrolls = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "{}") as Record<string, number>;
} catch {
  scrolls = {};
}

let popped = false;
/** Set right before an in-app replace so the replaced entry keeps its key and `prev`. */
let pendingReplace: EntryState | null = null;
let lastUrl = location.pathname + location.search;

const currentUrl = () => location.pathname + location.search;
const state = (): EntryState | null => {
  const s = history.state as EntryState | null;
  return s && typeof s.k === "string" ? s : null;
};

export function initHistory(): void {
  try {
    history.scrollRestoration = "manual";
  } catch {
    /* old browsers */
  }
  addEventListener("popstate", () => {
    popped = true;
  });
  let t: ReturnType<typeof setTimeout> | undefined;
  addEventListener(
    "scroll",
    () => {
      clearTimeout(t);
      t = setTimeout(saveScroll, 120);
    },
    { passive: true },
  );
  addEventListener("pagehide", saveScroll);
  stamp(false);
}

function saveScroll() {
  const s = state();
  if (!s) return;
  scrolls[s.k] = Math.round(scrollY);
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(scrolls));
  } catch {
    /* ignore */
  }
}

/** Gives the current entry a key (a state stamp, not a navigation). */
function stamp(pushed: boolean) {
  if (state()) return;
  if (pendingReplace) {
    history.replaceState(pendingReplace, "", location.href);
    pendingReplace = null;
    return;
  }
  const s: EntryState = { k: Math.random().toString(36).slice(2, 10) };
  if (pushed) s.prev = lastUrl;
  history.replaceState(s, "", location.href);
}

/** Runs on every location change from the app root. */
export function useHistoryEffects(): void {
  const { url } = useLocation();
  useLayoutEffect(() => {
    const wasPop = popped;
    popped = false;
    stamp(!wasPop);
    const prevPath = lastUrl.split("?")[0];
    lastUrl = currentUrl();
    const s = state();
    if (wasPop && s && prevPath !== location.pathname) restoreScroll(scrolls[s.k] ?? 0);
  }, [url]);
}

/** Data may still be loading; retry until the page is tall enough or we give up. */
function restoreScroll(y: number) {
  let tries = 0;
  const go = () => {
    if (document.documentElement.scrollHeight - innerHeight >= y || tries > 30) {
      scrollTo(0, y);
      return;
    }
    tries++;
    setTimeout(go, 50);
  };
  requestAnimationFrame(go);
}

/** Back button: go back when the previous entry is ours, otherwise go "up" to the parent screen. */
export function useBack(up: string): () => void {
  const { route } = useLocation();
  return () => {
    if (state()?.prev) history.back();
    else route(up);
  };
}

/**
 * Swaps the current entry for `url` (event tabs, one sheet for another). The entry keeps its key and
 * `prev`, so back still leaves the screen the way it was entered instead of walking through tabs.
 */
export function useReplace(): (url: string) => void {
  const { route } = useLocation();
  return (url: string) => {
    pendingReplace = state();
    route(url, true);
  };
}

/* ---------- sheets ---------- */

export function withQuery(path: string, q: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export function useSheet() {
  const loc = useLocation();
  const name = loc.query.sheet;
  const open = (sheet: string, params: Record<string, string | undefined> = {}) =>
    loc.route(withQuery(loc.path, { sheet, ...params }));
  const close = () => {
    const s = state();
    if (s?.prev && s.prev.split("?")[0] === loc.path && !new URLSearchParams(s.prev.split("?")[1] ?? "").get("sheet"))
      history.back();
    else {
      pendingReplace = s;
      loc.route(loc.path, true);
    }
  };
  /** Replaces the open sheet with another (back then closes it instead of returning to the first). */
  const swap = (sheet: string, params: Record<string, string | undefined> = {}) => {
    pendingReplace = state();
    loc.route(withQuery(loc.path, { sheet, ...params }), true);
  };
  return { name, query: loc.query, open, close, swap };
}

/** Remembers the element that opened a sheet so focus can return to it. */
export function useReturnFocus(active: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (active) opener.current = document.activeElement as HTMLElement | null;
    else if (opener.current?.isConnected) opener.current.focus();
  }, [active]);
}
