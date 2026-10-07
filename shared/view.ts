import type {
  EventState,
  EventSummary,
  EventView,
  Family,
  FamilyPrivate,
  FamilyPublic,
  FamilyView,
  GroupMeta,
  KidEventView,
  KidLegView,
  KidView,
  Leg,
  LogEntry,
  LogEntryView,
} from "./types.ts";
import { LEGS } from "./types.ts";
import { gapsFor, waitingKids } from "./gaps.ts";

export const LOG_TAIL = 50;

export function familyPublic(f: Family | FamilyPrivate): FamilyPublic {
  return {
    id: f.id,
    name: f.name,
    color: f.color,
    parents: f.parents.map((p) => ({ name: p.name })),
    kids: f.kids.map((k) => ({ id: k.id, name: k.name })),
    cars: f.cars.map((c) => ({ ...c })),
  };
}

export function familyPrivate(f: Family): FamilyPrivate {
  const { keyHash: _, ...rest } = f;
  return {
    ...rest,
    parents: f.parents.map((p) => ({ ...p })),
    kids: f.kids.map((k) => ({ ...k })),
    cars: f.cars.map((c) => ({ ...c })),
  };
}

export function eventSummary(state: EventState): EventSummary {
  const s: EventSummary = {
    id: state.id,
    title: state.title,
    date: state.date,
    start: state.start,
    returnTime: state.returnTime,
    place: state.place,
    hostFamilyId: state.hostFamilyId,
    version: state.version,
    gaps: gapsFor(state),
  };
  if (state.coverImageId) s.coverImageId = state.coverImageId;
  return s;
}

export function logEntryView(e: LogEntry): LogEntryView {
  const { inverse: _, ...rest } = e;
  return rest;
}

/** Who can see what, for one requester (build-plan §3 "Visibility"). */
export function visibility(state: EventState, families: readonly (Family | FamilyPrivate)[], requester: string | null) {
  const familyOfKid = new Map<string, string>();
  for (const f of families) for (const k of f.kids) familyOfKid.set(k.id, f.id);
  const offers = LEGS.flatMap((leg) => state.offers[leg]);
  const passengersOf = (o: { kidIds: string[] }) => new Set(o.kidIds.map((k) => familyOfKid.get(k)));

  return {
    parentPhones(target: string): boolean {
      if (requester === null) return false;
      if (requester === target || requester === state.hostFamilyId) return true;
      return offers.some(
        (o) =>
          (o.familyId === requester && passengersOf(o).has(target)) ||
          (o.familyId === target && passengersOf(o).has(requester)),
      );
    },
    kidPhone(kidId: string): boolean {
      if (requester === null) return false;
      if (familyOfKid.get(kidId) === requester) return true;
      return offers.some((o) => o.familyId === requester && o.kidIds.includes(kidId));
    },
    address(target: string): boolean {
      if (requester === null) return false;
      if (requester === target) return true;
      return offers.some((o) => o.familyId === requester && passengersOf(o).has(target));
    },
  };
}

/** The event as `requesterFamilyId` may see it; phones and addresses only where allowed. */
export function viewFor(
  state: EventState,
  families: readonly (Family | FamilyPrivate)[],
  requesterFamilyId: string | null,
  log: readonly LogEntry[] = [],
): EventView {
  const me = requesterFamilyId && families.some((f) => f.id === requesterFamilyId) ? requesterFamilyId : null;
  const can = visibility(state, families, me);

  const familyViews: FamilyView[] = families.map((f) => {
    const showParents = can.parentPhones(f.id);
    const v: FamilyView = {
      id: f.id,
      name: f.name,
      color: f.color,
      parents: f.parents.map((p) => (showParents ? { name: p.name, phone: p.phone } : { name: p.name })),
      kids: f.kids.map((k) => (k.phone && can.kidPhone(k.id) ? { id: k.id, name: k.name, phone: k.phone } : { id: k.id, name: k.name })),
      cars: f.cars.map((c) => ({ ...c })),
    };
    if (f.address && can.address(f.id)) v.address = f.address;
    return v;
  });

  const kidPlans: EventView["kidPlans"] = {};
  for (const [k, p] of Object.entries(state.kidPlans)) kidPlans[k] = { ...p };
  const copyOffers = (leg: Leg) =>
    state.offers[leg].map((o) => ({
      ...o,
      kidIds: [...o.kidIds],
      ...(o.ready ? { ready: [...o.ready] } : {}),
      ...(o.run ? { run: { ...o.run, picked: [...o.run.picked] } } : {}),
    }));

  const view: EventView = {
    id: state.id,
    title: state.title,
    date: state.date,
    start: state.start,
    returnTime: state.returnTime,
    place: state.place,
    address: state.address,
    hostFamilyId: state.hostFamilyId,
    createdAt: state.createdAt,
    version: state.version,
    kidPlans,
    offers: { out: copyOffers("out"), back: copyOffers("back") },
    gaps: gapsFor(state),
    families: familyViews,
    waiting: { out: waitingKids(state, "out"), back: waitingKids(state, "back") },
    log: log.slice(-LOG_TAIL).map(logEntryView),
    me,
  };
  if (state.coverImageId) view.coverImageId = state.coverImageId;
  return view;
}

/**
 * The read-only kid page: upcoming events (date >= `today`, `yyyy-mm-dd`) and, per leg,
 * the ride the kid is seated in. Null when the token is unknown.
 */
export function kidView(
  group: GroupMeta,
  families: readonly (Family | FamilyPrivate)[],
  events: readonly EventState[],
  kidToken: string,
  today: string,
): KidView | null {
  const family = families.find((f) => f.kids.some((k) => k.kidToken === kidToken));
  const kid = family?.kids.find((k) => k.kidToken === kidToken);
  if (!family || !kid) return null;

  const legView = (e: EventState, leg: Leg): KidLegView => {
    const plan = e.kidPlans[kid.id];
    const needed = !!plan && plan.rsvp === "yes" && plan[leg];
    const offer = e.offers[leg].find((o) => o.kidIds.includes(kid.id));
    const driver = offer && families.find((f) => f.id === offer.familyId);
    const car = driver?.cars.find((c) => c.id === offer!.carId);
    if (!offer || !driver || !car) return { needed, ride: null };
    return {
      needed,
      ride: {
        offerId: offer.id,
        departAt: offer.departAt,
        driver: { familyId: driver.id, name: driver.name, color: driver.color, parents: driver.parents.map((p) => ({ ...p })) },
        car: { ...car },
        started: !!offer.run,
        picked: !!offer.run?.picked.includes(kid.id),
        ready: !!offer.ready?.includes(kid.id),
      },
    };
  };

  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((e): KidEventView => {
      const v: KidEventView = {
        id: e.id,
        title: e.title,
        date: e.date,
        start: e.start,
        returnTime: e.returnTime,
        place: e.place,
        address: e.address,
        rsvp: e.kidPlans[kid.id]?.rsvp ?? null,
        legs: { out: legView(e, "out"), back: legView(e, "back") },
      };
      if (e.coverImageId) v.coverImageId = e.coverImageId;
      return v;
    });

  return {
    group: { id: group.id, name: group.name },
    kid: { id: kid.id, name: kid.name, familyId: family.id, familyName: family.name, color: family.color },
    events: upcoming,
  };
}
