import { useReducer, useRef } from "preact/hooks";
import type { EventView, FamilyView, Leg } from "../shared/types.ts";

export const FAMILY_COLORS = 5;
/** CSS color for a family palette index. */
export const famColor = (i: number) => `var(--f${(((i % FAMILY_COLORS) + FAMILY_COLORS) % FAMILY_COLORS) + 1})`;

function utcDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
}

/** "יום שישי, 16.10" */
export function fmtDate(ymd: string): string {
  const d = utcDate(ymd);
  if (!d) return ymd;
  const wd = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" }).format(d);
  return `${wd}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

/** Day number and short month for the date badge. */
export function dateBadge(ymd: string): { day: string; month: string } {
  const d = utcDate(ymd);
  if (!d) return { day: "?", month: "" };
  return {
    day: String(d.getUTCDate()),
    month: new Intl.DateTimeFormat("he-IL", { month: "short", timeZone: "UTC" }).format(d),
  };
}

export function fmtClock(ms: number): string {
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMinutes(hhmm: string, mins: number): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const t = (((+m[1]! * 60 + +m[2]! + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export const initial = (name: string) => [...name.trim()][0] ?? "?";

/** Lookup helpers over an EventView. */
export function eventIndex(ev: EventView) {
  const famById = new Map<string, FamilyView>();
  const kidById = new Map<string, { id: string; name: string; phone?: string; family: FamilyView }>();
  for (const f of ev.families) {
    famById.set(f.id, f);
    for (const k of f.kids) kidById.set(k.id, { ...k, family: f });
  }
  return {
    fam: (id: string) => famById.get(id),
    kid: (id: string) => kidById.get(id),
    kidName: (id: string) => kidById.get(id)?.name ?? "?",
    famName: (id: string) => famById.get(id)?.name ?? "?",
    car: (familyId: string, carId: string) => famById.get(familyId)?.cars.find((c) => c.id === carId),
  };
}

export const legTime = (ev: { start: string; returnTime: string }, leg: Leg) => (leg === "out" ? ev.start : ev.returnTime);

export const appUrl = (path: string) => `${location.origin}${path}`;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A stable "re-render me" callback for external stores. */
export function useForce(): () => void {
  const [, d] = useReducer((n: number) => n + 1, 0);
  const ref = useRef<(() => void) | undefined>(undefined);
  if (!ref.current) ref.current = () => d(undefined);
  return ref.current;
}
