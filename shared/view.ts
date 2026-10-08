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
  KidLegStatus,
  KidLegView,
  KidView,
  Leg,
  LogEntry,
  LogEntryView,
  Run,
} from "./types.ts";
import { gapsFor, waitingKids } from "./gaps.ts";
import { offerDriver } from "./drivers.ts";

export const LOG_TAIL = 50;

/** A clean copy of a family; strips fields older versions stored (`keyHash`, `kidToken`). */
export function familyPublic(f: Family): FamilyPublic {
  const out: FamilyPublic = {
    id: f.id,
    name: f.name,
    color: f.color,
    parents: f.parents.map((p) => ({ id: p.id, name: p.name, phone: p.phone })),
    address: f.address,
    kids: f.kids.map((k) => (k.phone ? { id: k.id, name: k.name, phone: k.phone } : { id: k.id, name: k.name })),
    cars: f.cars.map((c) => ({ ...c })),
    createdAt: f.createdAt,
  };
  if (f.city) out.city = f.city;
  return out;
}

/** The requester's own family; same data as `familyPublic`. */
export function familyPrivate(f: Family): FamilyPrivate {
  return familyPublic(f);
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
    kidPlans: Object.fromEntries(Object.entries(state.kidPlans).map(([k, p]) => [k, { ...p }])),
    seated: { out: state.offers.out.flatMap((o) => o.kidIds), back: state.offers.back.flatMap((o) => o.kidIds) },
  };
  if (state.coverImageId) s.coverImageId = state.coverImageId;
  if (state.cancelled) s.cancelled = true;
  return s;
}

export function logEntryView(e: LogEntry): LogEntryView {
  const { inverse: _, ...rest } = e;
  return rest;
}

/**
 * The event as `requesterFamilyId` sees it. Everyone in the group (and anyone with the link)
 * sees every family's phones and address; `me` is the requester when it is a member.
 */
export function viewFor(
  state: EventState,
  families: readonly Family[],
  requesterFamilyId: string | null,
  log: readonly LogEntry[] = [],
): EventView {
  const me = requesterFamilyId && families.some((f) => f.id === requesterFamilyId) ? requesterFamilyId : null;

  const familyViews: FamilyView[] = families.map((f) => {
    const v: FamilyView = {
      id: f.id,
      name: f.name,
      color: f.color,
      parents: f.parents.map((p) => ({ id: p.id, name: p.name, phone: p.phone })),
      kids: f.kids.map((k) => (k.phone ? { id: k.id, name: k.name, phone: k.phone } : { id: k.id, name: k.name })),
      cars: f.cars.map((c) => ({ ...c })),
      createdAt: f.createdAt,
    };
    if (f.address) v.address = f.address;
    if (f.city) v.city = f.city;
    return v;
  });

  const kidPlans: EventView["kidPlans"] = {};
  for (const [k, p] of Object.entries(state.kidPlans)) kidPlans[k] = { ...p };
  const copyRun = (r: Run): Run => ({
    ...r,
    picked: [...r.picked],
    ...(r.arrived ? { arrived: [...r.arrived] } : {}),
    ...(r.eta ? { eta: Object.fromEntries(Object.entries(r.eta).map(([k, v]) => [k, { ...v }])) } : {}),
  });
  const copyOffers = (leg: Leg) =>
    state.offers[leg].map((o) => ({
      ...o,
      kidIds: [...o.kidIds],
      ...(o.ready ? { ready: [...o.ready] } : {}),
      ...(o.run ? { run: copyRun(o.run) } : {}),
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
  if (state.cancelled) view.cancelled = true;
  return view;
}

/**
 * The driver's pickup order for one offer, as stops of kid ids. Out: one stop per family (home),
 * in seating order. Back: everyone boards together at the venue, so one stop. Driver mode and the
 * kid page both use this.
 */
export function pickupStops(leg: Leg, kidIds: readonly string[], familyOf: (kidId: string) => string | undefined): string[][] {
  if (leg === "back") return kidIds.length ? [[...kidIds]] : [];
  const stops: { fam: string; kids: string[] }[] = [];
  for (const kidId of kidIds) {
    const fam = familyOf(kidId) ?? `?${kidId}`;
    const stop = stops.find((x) => x.fam === fam);
    if (stop) stop.kids.push(kidId);
    else stops.push({ fam, kids: [kidId] });
  }
  return stops.map((x) => x.kids);
}

/** Minutes after the leg's time (out: event start, back: return time) after which the leg counts as over. */
export const LEG_OVER_AFTER_MIN: Record<Leg, number> = { out: 30, back: 90 };

/**
 * Whether a leg is over, given the local wall clock `now` as `yyyy-mm-ddTHH:MM` (event times are
 * local times in the group's zone, so the caller passes its local clock).
 */
export function legOver(e: { date: string; start: string; returnTime: string }, leg: Leg, now: string): boolean {
  const [h, m] = (leg === "out" ? e.start : e.returnTime).split(":").map(Number);
  const mins = (h ?? 0) * 60 + (m ?? 0) + LEG_OVER_AFTER_MIN[leg];
  const day = new Date(`${e.date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return false;
  day.setUTCMinutes(mins);
  return now >= day.toISOString().slice(0, 16);
}

/**
 * The kid page's live status for one leg; null when the kid doesn't need this leg.
 * done > picked > arrived > onTheWay > assigned > waiting. The leg is "done" once the driver ended
 * the run ("הגענו"), or when `over` (see `legOver`), except while a started run hasn't picked the
 * kid up yet (a late driver stays live).
 */
export function kidLegStatus(l: KidLegView, over: boolean): KidLegStatus | null {
  if (!l.needed) return null;
  const r = l.ride;
  if (r?.ended) return "done";
  if (over && !(r?.started && !r.picked)) return "done";
  if (!r) return "waiting";
  if (r.picked) return "picked";
  if (!r.started) return "assigned";
  if (r.arrived) return "arrived";
  return "onTheWay";
}

/**
 * The read-only kid page: upcoming events (date >= `today`, `yyyy-mm-dd`) and, per leg,
 * the ride the kid is seated in. With `eventId`, only that event (whatever its date).
 * Null when the kid id is unknown.
 */
export function kidView(
  group: GroupMeta,
  families: readonly Family[],
  events: readonly EventState[],
  kidId: string,
  today: string,
  eventId?: string,
): KidView | null {
  const family = families.find((f) => f.kids.some((k) => k.id === kidId));
  const kid = family?.kids.find((k) => k.id === kidId);
  if (!family || !kid) return null;

  const legView = (e: EventState, leg: Leg): KidLegView => {
    const plan = e.kidPlans[kid.id];
    const needed = !!plan && plan.rsvp === "yes" && plan[leg];
    const offer = e.offers[leg].find((o) => o.kidIds.includes(kid.id));
    const driver = offer && families.find((f) => f.id === offer.familyId);
    const car = driver?.cars.find((c) => c.id === offer!.carId);
    if (!offer || !driver || !car) return { needed, ride: null };
    const picked = offer.run?.picked ?? [];
    const person = offerDriver(offer, driver);
    return {
      needed,
      ride: {
        offerId: offer.id,
        departAt: offer.departAt,
        driver: {
          familyId: driver.id,
          name: driver.name,
          color: driver.color,
          parents: driver.parents.map((p) => ({ ...p })),
          person: person ? { name: person.name, phone: person.phone } : null,
        },
        car: { ...car },
        started: !!offer.run,
        picked: picked.includes(kid.id),
        ready: !!offer.ready?.includes(kid.id),
        arrived: !!offer.run?.arrived?.includes(kid.id),
        eta: offer.run?.eta?.[kid.id] ? { ...offer.run.eta[kid.id]! } : null,
        ended: offer.run?.endedAt !== undefined,
      },
    };
  };

  const upcoming = events
    .filter((e) => (eventId ? e.id === eventId : e.date >= today))
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
      if (e.cancelled) v.cancelled = true;
      return v;
    });

  return {
    group: { id: group.id, name: group.name },
    kid: { id: kid.id, name: kid.name, familyId: family.id, familyName: family.name, color: family.color },
    events: upcoming,
  };
}
