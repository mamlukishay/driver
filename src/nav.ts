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
let lastUrl = location.pathname + location.search;
const newKey = () => Math.random().toString(36).slice(2, 10);

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
  // The router calls pushState/replaceState(null, …). Stamp entries right there: a push records the
  // entry it came from (`prev`, so our back button can walk history); a replace (redirects such as
  // "מי אתם?") inherits the replaced entry's key and `prev`, so a redirect never pretends there is an
  // in-app entry behind it, and a replaced screen never stays in history.
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (data == null) data = { k: newKey(), prev: currentUrl() } satisfies EntryState;
    push(data, unused, url);
  };
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (data == null) data = state() ?? { k: newKey() };
    replace(data, unused, url);
  };
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
  stamp();
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

/** Gives an entry that has none (the first page load) a key, without a `prev`. */
function stamp() {
  if (!state()) history.replaceState({ k: newKey() } satisfies EntryState, "", location.href);
}

/** Runs on every location change from the app root. */
export function useHistoryEffects(): void {
  const { url } = useLocation();
  useLayoutEffect(() => {
    const wasPop = popped;
    popped = false;
    stamp();
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

/**
 * Back button: go back when the previous entry is ours, otherwise go "up" to the parent screen. Going
 * up replaces this entry, so with no in-app history the arrow keeps walking up the hierarchy
 * (invite → event → group → my groups) instead of bouncing back to where it started.
 */
export function useBack(up: string): () => void {
  const { route } = useLocation();
  return () => {
    if (state()?.prev) history.back();
    else route(up, true);
  };
}

/**
 * Leaves a transient screen ("מי אתם?", registration) for `url` without leaving it in history: back
 * when `url` is the entry we came from, otherwise replace this entry.
 */
export function useLeave(): (url: string) => void {
  const { route } = useLocation();
  const go = (url: string) => {
    const prev = state()?.prev;
    if (prev === url) history.back();
    else if (prev && prev.split("?")[0] === location.pathname) {
      // A sheet entry over this screen (e.g. the confirmation): step off it first, then leave.
      addEventListener("popstate", () => setTimeout(() => go(url)), { once: true });
      history.back();
    } else route(url, true);
  };
  return go;
}

/** onClick for a link that should replace the current entry (moving between transient screens). */
export function useReplaceLink(): (e: MouseEvent) => void {
  const { route } = useLocation();
  return (e) => {
    const a = e.currentTarget as HTMLAnchorElement;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // the router's own link handler would push as well
    route(a.getAttribute("href")!, true);
  };
}

/* ---------- sheets ---------- */

export function withQuery(path: string, q: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Query keys a sheet may add next to `sheet` (stripped on close). Every other query param belongs to
 * the screen (e.g. `/join/:g?new=1&next=…`) and is kept while a sheet opens and closes, so opening an
 * overlay never changes what the screen (or its guards/redirects) sees.
 */
const SHEET_PARAMS = ["sheet", "fam", "kid", "offer"];

export function useSheet() {
  const loc = useLocation();
  const name = loc.query.sheet;
  const screenQuery = () => {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(loc.query)) if (!SHEET_PARAMS.includes(k) && typeof v === "string") q[k] = v;
    return q;
  };
  const open = (sheet: string, params: Record<string, string | undefined> = {}) =>
    loc.route(withQuery(loc.path, { ...screenQuery(), sheet, ...params }));
  const close = () => {
    const s = state();
    if (s?.prev && s.prev.split("?")[0] === loc.path && !new URLSearchParams(s.prev.split("?")[1] ?? "").get("sheet"))
      history.back();
    else loc.route(withQuery(loc.path, screenQuery()), true);
  };
  return { name, query: loc.query, open, close };
}

/** Remembers the element that opened a sheet so focus can return to it. */
export function useReturnFocus(active: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (active) opener.current = document.activeElement as HTMLElement | null;
    else if (opener.current?.isConnected) opener.current.focus();
  }, [active]);
}
