export type Leg = "out" | "back";
export const LEGS: readonly Leg[] = ["out", "back"];

export type Rsvp = "yes" | "no";

export type ErrorCode =
  | "forbidden"
  | "not_found"
  | "invalid"
  | "seat_taken"
  | "car_full"
  | "stale"
  | "feature_off"
  | "too_large"
  | "undo_expired"
  | "slug_taken";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  seat_taken: 409,
  car_full: 409,
  stale: 409,
  feature_off: 501,
  too_large: 413,
  undo_expired: 409,
  slug_taken: 409,
};

/* ---------- families ---------- */

export interface Parent {
  name: string;
  /** Normalized `+9725XXXXXXXX`. */
  phone: string;
}

export interface Kid {
  id: string;
  name: string;
  phone?: string;
}

export interface Car {
  id: string;
  label: string;
  /** Passenger seats, excluding the driver. */
  seats: number;
  color?: string;
  /** Last digits of the plate, for recognition at the curb. */
  plate?: string;
  photoId?: string;
}

/** Stored as `family:{id}` in the group DO. */
export interface Family {
  id: string;
  /** Display surname: "כהן" → "משפחת כהן". */
  name: string;
  /** Index into the UI family palette. */
  color: number;
  parents: Parent[];
  address: string;
  kids: Kid[];
  cars: Car[];
  createdAt: number;
}

export interface KidInput {
  /** Present when editing an existing kid (keeps its id, and so its kid link). */
  id?: string;
  name: string;
  phone?: string;
}

export interface CarInput {
  id?: string;
  label: string;
  seats: number;
  color?: string;
  plate?: string;
  photoId?: string;
}

export interface FamilyInput {
  name: string;
  parents: Parent[];
  address: string;
  kids: KidInput[];
  cars: CarInput[];
}

export type CarPublic = Car;

/**
 * What every group member sees about a family: everything (trust model: families in a group
 * trust each other; never add sensitive fields).
 */
export type FamilyPublic = Family;

/** The requester's own family (same data as FamilyPublic; kept as a name for clarity). */
export type FamilyPrivate = Family;

/** The minimum the reducer needs to know about families. */
export interface FamilyRef {
  id: string;
  kids: readonly { id: string }[];
  cars: readonly { id: string; seats: number }[];
}

/* ---------- group ---------- */

export interface GroupMeta {
  /** The group's slug (also its Durable Object name and URL segment). */
  id: string;
  name: string;
  createdAt: number;
  version: number;
}

/* ---------- events ---------- */

export interface EventInput {
  title: string;
  /** `yyyy-mm-dd` */
  date: string;
  /** `HH:MM` */
  start: string;
  /** `HH:MM` pickup time for the way back. */
  returnTime: string;
  place: string;
  address: string;
  coverImageId?: string;
}

export interface KidPlan {
  rsvp: Rsvp;
  out: boolean;
  back: boolean;
}

export interface Run {
  startedAt: number;
  picked: string[];
  /** Kids whose stop the driver reached ("הגעתי") and who are not picked yet. Absent on older runs. */
  arrived?: string[];
}

export interface Offer {
  id: string;
  familyId: string;
  carId: string;
  seats: number;
  /** `HH:MM` */
  departAt: string;
  kidIds: string[];
  /** Kids who tapped "אני מוכן/ה" (subset of kidIds). */
  ready?: string[];
  run?: Run;
}

/** Stored as `event:{id}`; the materialized result of the action log. */
export interface EventState extends EventInput {
  /** The event's slug (`oct-16-birthday`), unique within the group and immutable. */
  id: string;
  hostFamilyId: string;
  createdAt: number;
  version: number;
  kidPlans: Record<string, KidPlan>;
  offers: Record<Leg, Offer[]>;
}

export type EventPatch = Partial<Omit<EventInput, "coverImageId">> & {
  /** `null` removes the cover. */
  coverImageId?: string | null;
};

/* ---------- actions ---------- */

export type PublicAction =
  | { type: "setKidPlan"; kidId: string; rsvp: Rsvp; out: boolean; back: boolean }
  | { type: "offerCar"; leg: Leg; carId: string; seats: number; departAt: string }
  | { type: "updateOffer"; offerId: string; seats?: number; departAt?: string }
  | { type: "removeOffer"; offerId: string }
  | { type: "seatKid"; offerId: string; kidId: string }
  | { type: "unseatKid"; offerId: string; kidId: string }
  | { type: "startRun"; offerId: string }
  | { type: "setPicked"; offerId: string; kidId: string; picked: boolean }
  | { type: "setKidReady"; offerId: string; kidId: string; ready: boolean }
  | { type: "setArrived"; offerId: string; kidId: string; arrived: boolean }
  | { type: "editEvent"; patch: EventPatch };

/** Only produced as inverses; rejected unless applied with `ctx.system`. */
export type SystemAction =
  | { type: "clearKidPlan"; kidId: string }
  | { type: "restoreOffer"; leg: Leg; offer: Offer }
  | { type: "setRun"; offerId: string; run: Run | null };

export type Action = PublicAction | SystemAction;
export type ActionType = Action["type"];

/** An ordered list of actions that reverts one log entry. */
export type Inverse = Action[];

export type LoggedAction = Action | { type: "undo"; logId: string };

/** Stored as `log:{eventId}:{seq}`. */
export interface LogEntry {
  id: string;
  eventId: string;
  at: number;
  familyId: string;
  action: LoggedAction;
  inverse: Inverse;
  /** Set on the original entry once it has been undone. */
  undoneBy?: string;
}

export type LogEntryView = Omit<LogEntry, "inverse">;

/* ---------- views ---------- */

export type GapState = "missing" | "unassigned" | "ok";

export interface LegGap {
  /** Kids with rsvp yes who need this leg. */
  need: number;
  /** Total seats offered on this leg. */
  seats: number;
  seated: number;
  waiting: number;
  /** max(0, need - seats) */
  missing: number;
  state: GapState;
}

export type Gaps = Record<Leg, LegGap>;

export interface EventSummary {
  id: string;
  title: string;
  date: string;
  start: string;
  returnTime: string;
  place: string;
  coverImageId?: string;
  hostFamilyId: string;
  version: number;
  gaps: Gaps;
}

/** A family inside an event view (everyone sees everything; kid phone/address only when set). */
export interface FamilyView {
  id: string;
  name: string;
  color: number;
  parents: { name: string; phone?: string }[];
  kids: { id: string; name: string; phone?: string }[];
  cars: CarPublic[];
  address?: string;
  /** For stable labels of same-named families (see familyLabel). */
  createdAt: number;
}

export interface EventView extends EventInput {
  id: string;
  hostFamilyId: string;
  createdAt: number;
  version: number;
  kidPlans: Record<string, KidPlan>;
  offers: Record<Leg, Offer[]>;
  gaps: Gaps;
  families: FamilyView[];
  /** Kids per leg who need a ride and are not seated yet. */
  waiting: Record<Leg, string[]>;
  log: LogEntryView[];
  me: string | null;
}

export interface KidRide {
  offerId: string;
  departAt: string;
  driver: { familyId: string; name: string; color: number; parents: Parent[] };
  car: CarPublic;
  started: boolean;
  picked: boolean;
  ready: boolean;
  /** The driver tapped "הגעתי" at this kid's stop (and hasn't picked them up yet). */
  arrived: boolean;
  /** Kids at earlier stops in the pickup order who are not picked up yet (0 = this kid is next). */
  ahead: number;
}

/** Live status of one leg on the kid page (see `kidLegStatus` in view.ts). */
export type KidLegStatus = "waiting" | "assigned" | "onTheWay" | "next" | "arrived" | "picked" | "done";

export interface KidLegView {
  needed: boolean;
  ride: KidRide | null;
}

export interface KidEventView {
  id: string;
  title: string;
  date: string;
  start: string;
  returnTime: string;
  place: string;
  address: string;
  coverImageId?: string;
  rsvp: Rsvp | null;
  legs: Record<Leg, KidLegView>;
}

export interface KidView {
  group: { id: string; name: string };
  kid: { id: string; name: string; familyId: string; familyName: string; color: number };
  events: KidEventView[];
}

/* ---------- API DTOs (build-plan §3) ---------- */

export interface ErrorResponse {
  error: ErrorCode;
}
export interface ConfigResponse {
  features: { places: boolean; routes: boolean; inviteParse: boolean };
}
export interface CreateGroupRequest {
  name: string;
  /** English URL name (`SLUG_RE`). Omitted → a random one. */
  slug?: string;
}
export interface CreateGroupResponse {
  groupId: string;
}
/** 409 body when the group slug is taken. */
export interface SlugTakenResponse {
  error: "slug_taken";
  suggestion?: string;
}
export interface GroupResponse {
  group: GroupMeta;
  families: FamilyPublic[];
  events: EventSummary[];
  me?: FamilyPrivate;
}
export interface RegisterFamilyResponse {
  familyId: string;
}
export interface UpdateFamilyResponse {
  me: FamilyPrivate;
}
/** `POST events` body: the event plus an optional English word for its slug. */
export type CreateEventRequest = EventInput & { slugWord?: string };
export interface CreateEventResponse {
  /** The new event's slug. */
  eventId: string;
}
export interface ActionResponse {
  event: EventView;
  logId: string;
}
export interface UndoRequest {
  logId: string;
}
export interface UndoResponse {
  event: EventView;
}
export interface ImageUploadResponse {
  imageId: string;
}
export interface InviteParseRequest {
  imageId: string;
}
export interface InviteParseResponse {
  title?: string;
  date?: string;
  times?: string[];
  place?: string;
  address?: string;
}
export interface PlacesResponse {
  suggestions: { text: string; placeId: string }[];
}
export type WsMessage =
  | { t: "event"; eventId: string; version: number }
  | { t: "group"; version: number };

/** Which family the client acts as. The server only checks that it exists in the group. */
export const FAMILY_ID_HEADER = "X-Family-Id";
export const UNDO_WINDOW_MS = 2 * 60 * 1000;
export const MAX_IMAGE_BYTES = 400 * 1024;
