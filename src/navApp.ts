/**
 * The navigation app this phone uses in driver mode (Waze by default). Per phone, not per group:
 * localStorage `trempush.navApp`, always behind try/catch, with an in-memory fallback.
 */
import { useEffect } from "preact/hooks";
import { useForce } from "./util.ts";

export type NavApp = "waze" | "gmaps";
export const NAV_APPS: readonly NavApp[] = ["waze", "gmaps"];

const KEY = "trempush.navApp";
let memory: NavApp | null = null;
const listeners = new Set<() => void>();

export function getNavApp(): NavApp {
  if (memory) return memory;
  try {
    memory = localStorage.getItem(KEY) === "gmaps" ? "gmaps" : "waze";
  } catch {
    memory = "waze";
  }
  return memory;
}

export function setNavApp(app: NavApp): void {
  memory = app;
  try {
    localStorage.setItem(KEY, app);
  } catch {
    /* private mode: this page view only */
  }
  listeners.forEach((l) => l());
}

export function onNavAppChange(l: () => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** The current app; re-renders when it changes anywhere on the page. */
export function useNavApp(): NavApp {
  const force = useForce();
  useEffect(() => onNavAppChange(force), []);
  return getNavApp();
}

/** A link that starts driving to one address in the given app. */
export function navUrl(app: NavApp, address: string): string {
  if (app === "gmaps") {
    const p = new URLSearchParams({ api: "1", destination: address, travelmode: "driving" });
    return `https://www.google.com/maps/dir/?${p.toString()}`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
