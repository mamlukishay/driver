import type { EventState, Family } from "../types.ts";
import type { ActionCtx } from "../actions.ts";

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const fam = (id: string, name: string, color: number, kids: Family["kids"], cars: Family["cars"], phone: string): Family => ({
  id,
  name,
  color,
  parents: [{ name: `parent-${id}`, phone }],
  address: `address-${id}`,
  kids,
  cars,
  createdAt: 0,
});

/** A = host, 2 kids + 4-seat car; B = 1 kid + 3-seat car; C = 1 kid, no car; D = no kids, 2-seat car. */
export const A = fam("fama", "Cohen", 0, [
  { id: "a1", name: "Noa", phone: "+972501111111" },
  { id: "a2", name: "Tal" },
], [{ id: "cara", label: "Mazda", seats: 4, plate: "123" }], "+972521000001");
export const B = fam("famb", "Levi", 1, [{ id: "b1", name: "Omer", phone: "+972502222222" }], [
  { id: "carb", label: "Kia", seats: 3 },
], "+972521000002");
export const C = fam("famc", "Mizrahi", 2, [{ id: "c1", name: "Yael", phone: "+972503333333" }], [], "+972521000003");
export const D = fam("famd", "Peretz", 3, [], [{ id: "card", label: "Fiat", seats: 2 }], "+972521000004");

export const FAMILIES = deepFreeze([A, B, C, D]);

export function ctx(ids: string[] = ["o1", "o2", "o3", "o4"]): ActionCtx {
  const queue = [...ids];
  return { families: FAMILIES, newId: () => queue.shift() ?? "ox" };
}

export function baseEvent(over: Partial<EventState> = {}): EventState {
  return deepFreeze({
    id: "ev1",
    title: "Party",
    date: "2026-10-20",
    start: "10:00",
    returnTime: "13:00",
    place: "Hall",
    address: "1 Main St",
    hostFamilyId: "fama",
    createdAt: 0,
    version: 1,
    kidPlans: {
      a1: { rsvp: "yes", out: true, back: true },
      a2: { rsvp: "yes", out: true, back: false },
      b1: { rsvp: "yes", out: true, back: true },
      c1: { rsvp: "yes", out: true, back: true },
    },
    offers: { out: [], back: [] },
    ...over,
  } satisfies EventState);
}
