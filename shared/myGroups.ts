/**
 * Pure helpers for "my groups" on a device: ordering by last use, the next event date per group,
 * and the registration prefill copied from this device's family in another group.
 */
import type { Family, FamilyInput } from "./types.ts";

/** Group slugs, most recently used first; never-used ones keep their original order at the end. */
export function byLastUsed(slugs: readonly string[], lastUsed: Readonly<Record<string, number>>): string[] {
  return slugs
    .map((s, i) => ({ s, i, t: lastUsed[s] ?? 0 }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.s);
}

/** The earliest non-cancelled event date on or after `today` (`yyyy-mm-dd`), or null. */
export function nextEventDate(events: readonly { date: string; cancelled?: true }[], today: string): string | null {
  let best: string | null = null;
  for (const e of events) {
    if (e.cancelled || e.date < today) continue;
    if (best === null || e.date < best) best = e.date;
  }
  return best;
}

export interface Prefill {
  /** The family's details for a new group: no kids, no ids, no car photos (images are per group). */
  family: FamilyInput;
  /** Kids to offer as unchecked choices ("מי מהילדים בקבוצה הזו?"). */
  kids: { name: string; phone?: string }[];
}

/** An independent copy of a family from another group, to prefill registration. */
export function prefillFrom(src: Pick<Family, "name" | "parents" | "address" | "city" | "kids" | "cars">): Prefill {
  return {
    family: {
      name: src.name,
      address: src.address,
      ...(src.city ? { city: src.city } : {}),
      parents: src.parents.map((p) => ({ name: p.name, phone: p.phone })),
      kids: [],
      cars: src.cars.map((c) => ({
        label: c.label,
        seats: c.seats,
        ...(c.color ? { color: c.color } : {}),
        ...(c.plate ? { plate: c.plate } : {}),
      })),
    },
    kids: src.kids.map((k) => ({ name: k.name, ...(k.phone ? { phone: k.phone } : {}) })),
  };
}
