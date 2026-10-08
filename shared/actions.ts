import type {
  Action,
  ErrorCode,
  EventPatch,
  EventState,
  FamilyRef,
  Inverse,
  KidPlan,
  Leg,
  LogEntry,
  Offer,
  Run,
} from "./types.ts";
import { LEGS, UNDO_WINDOW_MS } from "./types.ts";
import { newId } from "./ids.ts";
import { isDate, isTime, MAX_SEATS, cleanText } from "./validate.ts";

export interface ActionCtx {
  families: readonly FamilyRef[];
  /** Id generator for new offers; defaults to `newId(8)`. Inject for deterministic tests. */
  newId?: () => string;
  /**
   * Skip permission checks (integrity checks still apply) and allow SystemActions.
   * Set only when replaying inverses for undo.
   */
  system?: boolean;
}

export type ApplyResult =
  | { ok: true; state: EventState; inverse: Inverse }
  | { ok: false; error: ErrorCode };

type StepResult = { ok: true; inverse: Inverse } | { ok: false; error: ErrorCode };

const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

/**
 * Pure reducer: validates, checks permissions, and returns a new state (version + 1)
 * plus the inverse that reverts it. Never mutates `state`.
 */
export function applyAction(
  state: EventState,
  ctx: ActionCtx,
  action: Action,
  actorFamilyId: string,
  now: number,
): ApplyResult {
  return applyAll(state, ctx, [action], actorFamilyId, now);
}

/** Reverts the actor's own log entry if it is at most 2 minutes old. */
export function undo(
  state: EventState,
  ctx: ActionCtx,
  entry: LogEntry,
  actorFamilyId: string,
  now: number,
): ApplyResult {
  if (entry.familyId !== actorFamilyId) return fail("forbidden");
  if (entry.eventId !== state.id) return fail("not_found");
  if (entry.undoneBy) return fail("invalid");
  if (now - entry.at > UNDO_WINDOW_MS) return fail("undo_expired");
  return applyAll(state, { ...ctx, system: true }, entry.inverse, actorFamilyId, now);
}

function applyAll(
  state: EventState,
  ctx: ActionCtx,
  actions: readonly Action[],
  actor: string,
  now: number,
): ApplyResult {
  if (!Array.isArray(actions) || actions.length === 0) return fail("invalid");
  const next = cloneState(state);
  const inverses: Inverse[] = [];
  for (const action of actions) {
    const r = step(next, ctx, action, actor, now);
    if (!r.ok) return r;
    inverses.push(r.inverse);
  }
  next.version = state.version + 1;
  return { ok: true, state: next, inverse: inverses.reverse().flat() };
}

/* ---------- helpers ---------- */

function cloneRun(r: Run): Run {
  const c: Run = { ...r, picked: [...r.picked] };
  if (r.arrived) c.arrived = [...r.arrived];
  if (r.eta) c.eta = Object.fromEntries(Object.entries(r.eta).map(([k, v]) => [k, { ...v }]));
  return c;
}

/** Drops a kid's ETA from the run (and the field when empty). */
function clearEta(run: Run | undefined, kidId: string): void {
  if (!run?.eta || !(kidId in run.eta)) return;
  delete run.eta[kidId];
  if (Object.keys(run.eta).length === 0) delete run.eta;
}

const isEtaEntry = (v: unknown): v is { at: number; setAt: number } =>
  !!v && typeof v === "object" && Number.isFinite((v as { at: unknown }).at) && Number.isFinite((v as { setAt: unknown }).setAt);

/** Removes a kid from `run.arrived` (dropping the field when empty); returns whether they were there. */
function clearArrived(run: Run | undefined, kidId: string): boolean {
  if (!run?.arrived?.includes(kidId)) return false;
  run.arrived = run.arrived.filter((k) => k !== kidId);
  if (run.arrived.length === 0) delete run.arrived;
  return true;
}

function cloneOffer(o: Offer): Offer {
  const c: Offer = { ...o, kidIds: [...o.kidIds] };
  if (o.ready) c.ready = [...o.ready];
  if (o.run) c.run = cloneRun(o.run);
  return c;
}

function cloneState(s: EventState): EventState {
  const kidPlans: Record<string, KidPlan> = {};
  for (const [k, v] of Object.entries(s.kidPlans)) kidPlans[k] = { ...v };
  return { ...s, kidPlans, offers: { out: s.offers.out.map(cloneOffer), back: s.offers.back.map(cloneOffer) } };
}

function kidFamily(ctx: ActionCtx, kidId: string): FamilyRef | undefined {
  return ctx.families.find((f) => f.kids.some((k) => k.id === kidId));
}

function findOffer(s: EventState, offerId: unknown): { leg: Leg; offer: Offer } | undefined {
  if (typeof offerId !== "string") return undefined;
  for (const leg of LEGS) {
    const offer = s.offers[leg].find((o) => o.id === offerId);
    if (offer) return { leg, offer };
  }
  return undefined;
}

function needsLeg(s: EventState, kidId: string, leg: Leg): boolean {
  const p = s.kidPlans[kidId];
  return !!p && p.rsvp === "yes" && p[leg];
}

function seatedOn(s: EventState, kidId: string, leg: Leg): Offer | undefined {
  return s.offers[leg].find((o) => o.kidIds.includes(kidId));
}

type SeatFlags = { wasPicked: boolean; wasReady: boolean; wasArrived: boolean };

function removeKidFromOffer(o: Offer, kidId: string): SeatFlags {
  const wasPicked = !!o.run?.picked.includes(kidId);
  const wasReady = !!o.ready?.includes(kidId);
  o.kidIds = o.kidIds.filter((k) => k !== kidId);
  if (o.run) o.run.picked = o.run.picked.filter((k) => k !== kidId);
  const wasArrived = clearArrived(o.run, kidId);
  clearEta(o.run, kidId);
  if (o.ready) {
    o.ready = o.ready.filter((k) => k !== kidId);
    if (o.ready.length === 0) delete o.ready;
  }
  return { wasPicked, wasReady, wasArrived };
}

/** Inverse that puts a kid back into an offer with the same picked/ready/arrived flags. */
function reseatInverse(offerId: string, kidId: string, flags: SeatFlags): Inverse {
  const inv: Inverse = [{ type: "seatKid", offerId, kidId }];
  if (flags.wasPicked) inv.push({ type: "setPicked", offerId, kidId, picked: true });
  if (flags.wasReady) inv.push({ type: "setKidReady", offerId, kidId, ready: true });
  if (flags.wasArrived) inv.push({ type: "setArrived", offerId, kidId, arrived: true });
  return inv;
}

/** Unseats a kid from a leg; returns the inverse that reseats them. */
function unseatFromLeg(s: EventState, kidId: string, leg: Leg): Inverse {
  const o = seatedOn(s, kidId, leg);
  if (!o) return [];
  return reseatInverse(o.id, kidId, removeKidFromOffer(o, kidId));
}

const isSeats = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SEATS;
const isLeg = (l: unknown): l is Leg => l === "out" || l === "back";
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** Actions rejected with `event_cancelled` while the event is cancelled. */
const RIDE_ACTIONS: ReadonlySet<string> = new Set([
  "setKidPlan",
  "offerCar",
  "updateOffer",
  "removeOffer",
  "seatKid",
  "unseatKid",
  "startRun",
  "setPicked",
  "setArrived",
  "setEta",
  "endRun",
  "setKidReady",
  "confirmDeparture",
]);

/** Which legs' offers need "בדקו שעת יציאה" after an edit touching these fields. */
function legsTouched(changed: readonly string[]): Leg[] {
  const legs: Leg[] = [];
  if (changed.includes("date") || changed.includes("start")) legs.push("out");
  if (changed.includes("date") || changed.includes("returnTime")) legs.push("back");
  return legs;
}

/**
 * The action as it goes into the log. `editEvent` keeps only the fields that changed and gains
 * `prev` (their old values), so history and the "עודכן" banner can say "10:00 → 10:30".
 */
export function loggedAction(action: Action, inverse: Inverse): Action {
  if (action.type !== "editEvent") return action;
  const inv = inverse.find((x): x is Extract<Action, { type: "editEvent" }> => x.type === "editEvent");
  if (!inv) return action;
  const patch: EventPatch = {};
  for (const k of Object.keys(inv.patch) as (keyof EventPatch)[]) (patch as Record<string, unknown>)[k] = action.patch[k];
  return { type: "editEvent", patch, prev: { ...inv.patch } };
}

/* ---------- the reducer step (mutates the clone) ---------- */

function step(s: EventState, ctx: ActionCtx, a: Action, actor: string, now: number): StepResult {
  const sys = ctx.system === true;
  const actorFamily = ctx.families.find((f) => f.id === actor);
  if (!actorFamily && !sys) return fail("forbidden");
  if (!a || typeof a !== "object") return fail("invalid");
  const ownsKid = (kidId: string) => !!actorFamily?.kids.some((k) => k.id === kidId);
  // A cancelled event freezes its rides (undo replays run with `system` and stay allowed).
  if (!sys && s.cancelled && RIDE_ACTIONS.has(a.type)) return fail("event_cancelled");

  switch (a.type) {
    case "setKidPlan": {
      if (!isStr(a.kidId) || (a.rsvp !== "yes" && a.rsvp !== "no")) return fail("invalid");
      if (typeof a.out !== "boolean" || typeof a.back !== "boolean") return fail("invalid");
      if (!kidFamily(ctx, a.kidId)) return fail("not_found");
      if (!sys && !ownsKid(a.kidId)) return fail("forbidden");
      const prev = s.kidPlans[a.kidId];
      const plan: KidPlan = a.rsvp === "yes" ? { rsvp: "yes", out: a.out, back: a.back } : { rsvp: "no", out: false, back: false };
      s.kidPlans[a.kidId] = plan;
      const reseat: Inverse = [];
      for (const leg of LEGS) if (!plan[leg]) reseat.push(...unseatFromLeg(s, a.kidId, leg));
      const restorePlan: Action = prev
        ? { type: "setKidPlan", kidId: a.kidId, ...prev }
        : { type: "clearKidPlan", kidId: a.kidId };
      return { ok: true, inverse: [restorePlan, ...reseat] };
    }

    case "clearKidPlan": {
      if (!sys) return fail("forbidden");
      if (!isStr(a.kidId)) return fail("invalid");
      const prev = s.kidPlans[a.kidId];
      if (!prev) return { ok: true, inverse: [] };
      delete s.kidPlans[a.kidId];
      const reseat: Inverse = [];
      for (const leg of LEGS) reseat.push(...unseatFromLeg(s, a.kidId, leg));
      return { ok: true, inverse: [{ type: "setKidPlan", kidId: a.kidId, ...prev }, ...reseat] };
    }

    case "offerCar": {
      if (!isLeg(a.leg) || !isStr(a.carId) || !isSeats(a.seats) || !isTime(a.departAt)) return fail("invalid");
      const owner = ctx.families.find((f) => f.cars.some((c) => c.id === a.carId));
      if (!owner) return fail("not_found");
      if (!sys && owner.id !== actor) return fail("forbidden");
      const car = owner.cars.find((c) => c.id === a.carId)!;
      if (a.seats > car.seats) return fail("invalid");
      if (s.offers[a.leg].some((o) => o.familyId === owner.id)) return fail("invalid");
      const id = (ctx.newId ?? (() => newId(8)))();
      if (findOffer(s, id)) return fail("invalid");
      s.offers[a.leg].push({ id, familyId: owner.id, carId: a.carId, seats: a.seats, departAt: a.departAt, kidIds: [] });
      return { ok: true, inverse: [{ type: "removeOffer", offerId: id }] };
    }

    case "updateOffer": {
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (a.seats === undefined && a.departAt === undefined) return fail("invalid");
      if (a.seats !== undefined && !isSeats(a.seats)) return fail("invalid");
      if (a.departAt !== undefined && !isTime(a.departAt)) return fail("invalid");
      if (a.seats !== undefined) {
        if (a.seats < offer.kidIds.length) return fail("invalid");
        const car = ctx.families.find((f) => f.id === offer.familyId)?.cars.find((c) => c.id === offer.carId);
        if (car && a.seats > car.seats) return fail("invalid");
      }
      const inv: Extract<Action, { type: "updateOffer" }> = { type: "updateOffer", offerId: offer.id };
      if (a.seats !== undefined) {
        inv.seats = offer.seats;
        offer.seats = a.seats;
      }
      const inverse: Inverse = [inv];
      if (a.departAt !== undefined) {
        inv.departAt = offer.departAt;
        offer.departAt = a.departAt;
        // The driver looked at the time again: the "בדקו שעת יציאה" flag is done.
        if (offer.departAtCheck) {
          delete offer.departAtCheck;
          inverse.push({ type: "setDepartAtCheck", offerId: offer.id, check: true });
        }
      }
      return { ok: true, inverse };
    }

    case "confirmDeparture": {
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (!offer.departAtCheck) return fail("invalid");
      delete offer.departAtCheck;
      return { ok: true, inverse: [{ type: "setDepartAtCheck", offerId: offer.id, check: true }] };
    }

    case "setDepartAtCheck": {
      if (!sys) return fail("forbidden");
      if (typeof a.check !== "boolean") return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      const was = !!offer.departAtCheck;
      if (a.check) offer.departAtCheck = true;
      else delete offer.departAtCheck;
      return { ok: true, inverse: [{ type: "setDepartAtCheck", offerId: offer.id, check: was }] };
    }

    case "cancelEvent": {
      if (s.cancelled) return fail("invalid");
      s.cancelled = true;
      return { ok: true, inverse: [{ type: "restoreEvent" }] };
    }

    case "restoreEvent": {
      if (!s.cancelled) return fail("invalid");
      delete s.cancelled;
      return { ok: true, inverse: [{ type: "cancelEvent" }] };
    }

    case "removeOffer": {
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      if (!sys && found.offer.familyId !== actor) return fail("forbidden");
      s.offers[found.leg] = s.offers[found.leg].filter((o) => o.id !== found.offer.id);
      return { ok: true, inverse: [{ type: "restoreOffer", leg: found.leg, offer: cloneOffer(found.offer) }] };
    }

    case "restoreOffer": {
      if (!sys) return fail("forbidden");
      const o = a.offer;
      if (!isLeg(a.leg) || !o || !isStr(o.id) || !Array.isArray(o.kidIds)) return fail("invalid");
      if (findOffer(s, o.id)) return fail("stale");
      if (s.offers[a.leg].some((x) => x.familyId === o.familyId)) return fail("stale");
      if (o.kidIds.length > o.seats) return fail("car_full");
      for (const kidId of o.kidIds) {
        if (!needsLeg(s, kidId, a.leg)) return fail("stale");
        if (seatedOn(s, kidId, a.leg)) return fail("seat_taken");
      }
      s.offers[a.leg].push(cloneOffer(o));
      return { ok: true, inverse: [{ type: "removeOffer", offerId: o.id }] };
    }

    case "seatKid": {
      if (!isStr(a.kidId)) return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      if (!kidFamily(ctx, a.kidId)) return fail("not_found");
      const { leg, offer } = found;
      if (!sys && !ownsKid(a.kidId) && offer.familyId !== actor) return fail("forbidden");
      if (!needsLeg(s, a.kidId, leg)) return fail("invalid");
      if (seatedOn(s, a.kidId, leg)) return fail("seat_taken");
      if (offer.kidIds.length >= offer.seats) return fail("car_full");
      offer.kidIds.push(a.kidId);
      // The driver's own kid rides along from home on the out leg: on board as soon as they're seated.
      if (leg === "out" && offer.run && kidFamily(ctx, a.kidId)?.id === offer.familyId && !offer.run.picked.includes(a.kidId)) {
        offer.run.picked.push(a.kidId);
      }
      return { ok: true, inverse: [{ type: "unseatKid", offerId: offer.id, kidId: a.kidId }] };
    }

    case "unseatKid": {
      if (!isStr(a.kidId)) return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && !ownsKid(a.kidId) && offer.familyId !== actor) return fail("forbidden");
      if (!offer.kidIds.includes(a.kidId)) return fail("not_found");
      return { ok: true, inverse: reseatInverse(offer.id, a.kidId, removeKidFromOffer(offer, a.kidId)) };
    }

    case "startRun": {
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (offer.run) return fail("invalid");
      // On the out leg the driver's own kids leave home in the car, so they start out picked.
      const picked = found.leg === "out" ? offer.kidIds.filter((k) => kidFamily(ctx, k)?.id === offer.familyId) : [];
      offer.run = { startedAt: now, picked };
      return { ok: true, inverse: [{ type: "setRun", offerId: offer.id, run: null }] };
    }

    case "setRun": {
      if (!sys) return fail("forbidden");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      const prev: Run | null = offer.run ? cloneRun(offer.run) : null;
      if (a.run) {
        if (typeof a.run.startedAt !== "number" || !Array.isArray(a.run.picked)) return fail("invalid");
        if (a.run.arrived !== undefined && !Array.isArray(a.run.arrived)) return fail("invalid");
        if (a.run.eta !== undefined && (!a.run.eta || typeof a.run.eta !== "object" || Array.isArray(a.run.eta))) return fail("invalid");
        if (a.run.endedAt !== undefined && !Number.isFinite(a.run.endedAt)) return fail("invalid");
        offer.run = { startedAt: a.run.startedAt, picked: a.run.picked.filter((k) => offer.kidIds.includes(k)) };
        const arrived = (a.run.arrived ?? []).filter((k) => offer.kidIds.includes(k));
        if (arrived.length) offer.run.arrived = arrived;
        const eta: Record<string, { at: number; setAt: number }> = {};
        for (const [k, v] of Object.entries(a.run.eta ?? {})) {
          if (!isEtaEntry(v)) return fail("invalid");
          if (offer.kidIds.includes(k)) eta[k] = { at: v.at, setAt: v.setAt };
        }
        if (Object.keys(eta).length) offer.run.eta = eta;
        if (a.run.endedAt !== undefined) offer.run.endedAt = a.run.endedAt;
      } else {
        delete offer.run;
      }
      return { ok: true, inverse: [{ type: "setRun", offerId: offer.id, run: prev }] };
    }

    case "setPicked": {
      if (!isStr(a.kidId) || typeof a.picked !== "boolean") return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (!offer.kidIds.includes(a.kidId)) return fail("not_found");
      if (!offer.run) return fail("invalid");
      const was = offer.run.picked.includes(a.kidId);
      // Picking a kid ends their "הגעתי" state.
      const wasArrived = a.picked ? clearArrived(offer.run, a.kidId) : false;
      if (a.picked && !was) offer.run.picked.push(a.kidId);
      if (!a.picked && was) offer.run.picked = offer.run.picked.filter((k) => k !== a.kidId);
      const inv: Inverse = [{ type: "setPicked", offerId: offer.id, kidId: a.kidId, picked: was }];
      if (wasArrived) inv.push({ type: "setArrived", offerId: offer.id, kidId: a.kidId, arrived: true });
      return { ok: true, inverse: inv };
    }

    case "setArrived": {
      if (!isStr(a.kidId) || typeof a.arrived !== "boolean") return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (!offer.kidIds.includes(a.kidId)) return fail("not_found");
      if (!offer.run) return fail("invalid");
      if (a.arrived && offer.run.picked.includes(a.kidId)) return fail("invalid");
      const was = !!offer.run.arrived?.includes(a.kidId);
      if (a.arrived && !was) offer.run.arrived = [...(offer.run.arrived ?? []), a.kidId];
      if (!a.arrived && was) clearArrived(offer.run, a.kidId);
      return { ok: true, inverse: [{ type: "setArrived", offerId: offer.id, kidId: a.kidId, arrived: was }] };
    }

    case "setEta": {
      if (!Number.isInteger(a.minutes) || a.minutes < 1 || a.minutes > 60) return fail("invalid");
      if (!Array.isArray(a.kidIds) || a.kidIds.length === 0 || !a.kidIds.every(isStr)) return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (!a.kidIds.every((k) => offer.kidIds.includes(k))) return fail("not_found");
      if (!offer.run) return fail("invalid");
      const prev = cloneRun(offer.run);
      const eta = (offer.run.eta ??= {});
      for (const k of a.kidIds) eta[k] = { at: now + a.minutes * 60_000, setAt: now };
      return { ok: true, inverse: [{ type: "setRun", offerId: offer.id, run: prev }] };
    }

    case "endRun": {
      if (typeof a.ended !== "boolean") return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && offer.familyId !== actor) return fail("forbidden");
      if (!offer.run) return fail("invalid");
      const prev = cloneRun(offer.run);
      if (a.ended) offer.run.endedAt = now;
      else delete offer.run.endedAt;
      return { ok: true, inverse: [{ type: "setRun", offerId: offer.id, run: prev }] };
    }

    case "setKidReady": {
      if (!isStr(a.kidId) || typeof a.ready !== "boolean") return fail("invalid");
      const found = findOffer(s, a.offerId);
      if (!found) return fail("not_found");
      const { offer } = found;
      if (!sys && !ownsKid(a.kidId)) return fail("forbidden");
      if (!offer.kidIds.includes(a.kidId)) return fail("not_found");
      const was = !!offer.ready?.includes(a.kidId);
      if (a.ready && !was) offer.ready = [...(offer.ready ?? []), a.kidId];
      if (!a.ready && was) {
        offer.ready = offer.ready!.filter((k) => k !== a.kidId);
        if (offer.ready.length === 0) delete offer.ready;
      }
      return { ok: true, inverse: [{ type: "setKidReady", offerId: offer.id, kidId: a.kidId, ready: was }] };
    }

    case "editEvent": {
      // Any family may edit (trust model: logged and undoable). The slug never changes.
      const patch = a.patch;
      if (!patch || typeof patch !== "object") return fail("invalid");
      const keys = Object.keys(patch) as (keyof EventPatch)[];
      if (keys.length === 0) return fail("invalid");
      const inv: EventPatch = {};
      for (const key of keys) {
        const value = patch[key];
        switch (key) {
          case "title":
          case "place":
          case "address": {
            const v = cleanText(value, key === "address" ? 200 : 100);
            if (v === null || (key === "title" && v === "")) return fail("invalid");
            if (v === s[key]) break;
            inv[key] = s[key];
            s[key] = v;
            break;
          }
          case "date":
            if (!isDate(value)) return fail("invalid");
            if (value === s.date) break;
            inv.date = s.date;
            s.date = value;
            break;
          case "start":
          case "returnTime":
            if (!isTime(value)) return fail("invalid");
            if (value === s[key]) break;
            inv[key] = s[key];
            s[key] = value;
            break;
          case "coverImageId":
            if (value !== null && !isStr(value)) return fail("invalid");
            if ((value ?? undefined) === s.coverImageId) break;
            inv.coverImageId = s.coverImageId ?? null;
            if (value === null) delete s.coverImageId;
            else s.coverImageId = value;
            break;
          default:
            return fail("invalid");
        }
      }
      const changed = Object.keys(inv);
      // Nothing changed: a mistake from a client, but a harmless no-op when replaying an undo.
      if (changed.length === 0) return sys ? { ok: true, inverse: [] } : fail("invalid");
      const inverse: Inverse = [{ type: "editEvent", patch: inv }];
      // Drivers' times don't move on their own; flag every car on a leg whose time may have moved.
      for (const leg of legsTouched(changed)) {
        for (const o of s.offers[leg]) {
          if (!o.departAtCheck) inverse.push({ type: "setDepartAtCheck", offerId: o.id, check: false });
          o.departAtCheck = true;
        }
      }
      return { ok: true, inverse };
    }

    default:
      return fail("invalid");
  }
}
