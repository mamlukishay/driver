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
  | "undo_expired";

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
  kidToken: string;
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
  keyHash: string;
  createdAt: number;
}

export interface KidInput {
  /** Present when editing an existing kid (keeps its id and kidToken). */
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

/** What every group member sees about a family. */
export interface FamilyPublic {
  id: string;
  name: string;
  color: number;
  parents: { name: string }[];
  kids: { id: string; name: string }[];
  cars: CarPublic[];
}

/** The requester's own family, everything except keyHash. */
export type FamilyPrivate = Omit<Family, "keyHash">;

/** The minimum the reducer needs to know about families. */
export interface FamilyRef {
  id: string;
  kids: readonly { id: string }[];
  cars: readonly { id: string; seats: number }[];
}

/* ---------- group ---------- */

export interface GroupMeta {
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

/** A family as one requester sees it inside an event; optional fields appear only where allowed. */
export interface FamilyView {
  id: string;
  name: string;
  color: number;
  parents: { name: string; phone?: string }[];
  kids: { id: string; name: string; phone?: string }[];
  cars: CarPublic[];
  address?: string;
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
}

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
}
export interface CreateGroupResponse {
  groupId: string;
}
export interface GroupResponse {
  group: GroupMeta;
  families: FamilyPublic[];
  events: EventSummary[];
  me?: FamilyPrivate;
}
export interface RegisterFamilyResponse {
  familyId: string;
  /** `<familyId>.<secret>`, sent back as the `X-Family-Key` header. */
  key: string;
}
export interface UpdateFamilyResponse {
  me: FamilyPrivate;
}
export interface CreateEventResponse {
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

export const FAMILY_KEY_HEADER = "X-Family-Key";
export const UNDO_WINDOW_MS = 2 * 60 * 1000;
export const MAX_IMAGE_BYTES = 400 * 1024;
