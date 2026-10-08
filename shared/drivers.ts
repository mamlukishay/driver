/**
 * Who drives an offer. A family's people (`parents`: parents and any other adult who drives) can each
 * drive any of its cars; an offer names one of them in `driverId`. Older offers have no `driverId`, and
 * a person may have left the family since: both fall back to the family's first person.
 */
import type { Family, Offer } from "./types.ts";

type People<P> = { parents: readonly P[] } | undefined;

/** The effective driver's id: `offer.driverId` while that person is still in the family, else the first person. */
export function offerDriverId(offer: Pick<Offer, "driverId">, family: People<{ id: string }>): string | undefined {
  const people = family?.parents ?? [];
  if (offer.driverId && people.some((p) => p.id === offer.driverId)) return offer.driverId;
  return people[0]?.id;
}

/** The effective driver (see `offerDriverId`); undefined only for a family with no people. */
export function offerDriver<P extends { id: string }>(offer: Pick<Offer, "driverId">, family: People<P>): P | undefined {
  const id = offerDriverId(offer, family);
  return family?.parents.find((p) => p.id === id);
}

/**
 * A stored family with ids on all its people. Families stored before drivers have none: each gets
 * `p<index>`, deterministic so every read agrees (and the family form saves them on the next edit).
 */
export function withParentIds(f: Family): Family {
  if (!Array.isArray(f.parents) || f.parents.every((p) => typeof p.id === "string" && p.id)) return f;
  return { ...f, parents: f.parents.map((p, i) => (typeof p.id === "string" && p.id ? p : { ...p, id: `p${i}` })) };
}
