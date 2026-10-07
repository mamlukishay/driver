import type { EventState, Gaps, Leg, LegGap } from "./types.ts";
import { LEGS } from "./types.ts";

/** Kids with rsvp yes who need this leg, in plan order. */
export function neededKids(state: EventState, leg: Leg): string[] {
  return Object.entries(state.kidPlans)
    .filter(([, p]) => p.rsvp === "yes" && p[leg])
    .map(([kidId]) => kidId);
}

export function waitingKids(state: EventState, leg: Leg): string[] {
  const seated = new Set(state.offers[leg].flatMap((o) => o.kidIds));
  return neededKids(state, leg).filter((k) => !seated.has(k));
}

export function legGap(state: EventState, leg: Leg): LegGap {
  const need = neededKids(state, leg).length;
  const seats = state.offers[leg].reduce((n, o) => n + o.seats, 0);
  const seated = state.offers[leg].reduce((n, o) => n + o.kidIds.length, 0);
  const waiting = waitingKids(state, leg).length;
  const missing = Math.max(0, need - seats);
  const gapState = missing > 0 ? "missing" : waiting > 0 ? "unassigned" : "ok";
  return { need, seats, seated, waiting, missing, state: gapState };
}

export function gapsFor(state: EventState): Gaps {
  return Object.fromEntries(LEGS.map((leg) => [leg, legGap(state, leg)])) as Gaps;
}
