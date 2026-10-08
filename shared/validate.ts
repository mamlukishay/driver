import type { Car, EventInput, EventState, Family, FamilyInput, Kid, Parent } from "./types.ts";
import { nextKidSlug } from "./kidSlug.ts";
import { normalizePhone } from "./phone.ts";
import { isKidSlug } from "./slug.ts";

export const MAX_SEATS = 12;
export const MAX_KIDS = 12;
export const MAX_CARS = 5;
export const MAX_PARENTS = 4;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: "invalid" };

const invalid = { ok: false, error: "invalid" } as const;

export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Trims and bounds a free-text field; null when it isn't a string or is too long. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function optStr(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  const t = cleanText(v, max);
  return t === "" ? undefined : t;
}

/**
 * "undefined" / "null" as a name only ever comes from a bug stringifying a missing value, never from a
 * person; blank (after trimming) or not a string counts as missing too.
 */
export function isJunkName(v: unknown): boolean {
  if (typeof v !== "string") return true;
  const t = v.trim();
  return t === "" || /^(undefined|null)$/i.test(t);
}

/** A person's or family's name: trimmed, at most `max` chars, never blank or "undefined"/"null"; else null. */
function cleanName(v: unknown, max = 40): string | null {
  const t = cleanText(v, max);
  return t && !isJunkName(t) ? t : null;
}

/** Validates and normalizes registration/profile input (phones → `+9725XXXXXXXX`). */
export function validateFamilyInput(input: unknown): Validated<FamilyInput> {
  if (!isObj(input)) return invalid;
  const name = cleanName(input.name);
  const address = cleanText(input.address ?? "", 200);
  if (!name || address === null) return invalid;
  if (!Array.isArray(input.parents) || input.parents.length < 1 || input.parents.length > MAX_PARENTS) return invalid;
  if (!Array.isArray(input.kids) || input.kids.length > MAX_KIDS) return invalid;
  if (!Array.isArray(input.cars ?? []) || (input.cars as unknown[] | undefined ?? []).length > MAX_CARS) return invalid;

  const parents: Parent[] = [];
  for (const p of input.parents) {
    if (!isObj(p)) return invalid;
    const pname = cleanName(p.name);
    const phone = typeof p.phone === "string" ? normalizePhone(p.phone) : null;
    if (!pname || !phone) return invalid;
    parents.push({ name: pname, phone });
  }

  const kids: FamilyInput["kids"] = [];
  for (const k of input.kids) {
    if (!isObj(k)) return invalid;
    const kname = cleanName(k.name);
    if (!kname) return invalid;
    const kid: FamilyInput["kids"][number] = { name: kname };
    if (k.id !== undefined) {
      if (typeof k.id !== "string" || k.id.length > 64) return invalid;
      kid.id = k.id;
    }
    if (k.phone !== undefined && k.phone !== null && k.phone !== "") {
      const phone = typeof k.phone === "string" ? normalizePhone(k.phone) : null;
      if (!phone) return invalid;
      kid.phone = phone;
    }
    if (k.slug !== undefined && k.slug !== null) {
      // "" clears the link name; anything else must be a valid kid slug.
      if (typeof k.slug !== "string" || (k.slug !== "" && !isKidSlug(k.slug))) return invalid;
      kid.slug = k.slug;
    }
    kids.push(kid);
  }

  const cars: FamilyInput["cars"] = [];
  for (const c of (input.cars as unknown[] | undefined) ?? []) {
    if (!isObj(c)) return invalid;
    const label = cleanText(c.label, 40);
    if (!label || !Number.isInteger(c.seats) || (c.seats as number) < 1 || (c.seats as number) > MAX_SEATS) return invalid;
    const car: FamilyInput["cars"][number] = { label, seats: c.seats as number };
    if (c.id !== undefined) {
      if (typeof c.id !== "string" || c.id.length > 64) return invalid;
      car.id = c.id;
    }
    for (const [key, max] of [["color", 30], ["plate", 10], ["photoId", 64]] as const) {
      const v = optStr(c[key], max);
      if (v === null) return invalid;
      if (v !== undefined) car[key] = v;
    }
    cars.push(car);
  }

  return { ok: true, value: { name, parents, address, kids, cars } };
}

export interface FamilyBase {
  id: string;
  color: number;
  createdAt: number;
}

/**
 * Builds the stored Family from validated input. Kids/cars whose `id` matches `prev` keep
 * their id (so kid links keep working); everything else gets fresh ids. A kid's link name follows
 * `nextKidSlug` (absent keeps it, "" clears it, a replaced slug stays as an alias).
 */
export function buildFamily(
  input: FamilyInput,
  base: FamilyBase,
  prev: Family | null,
  gen: { id: () => string },
): Family {
  const kids: Kid[] = input.kids.map((k) => {
    const old = k.id ? prev?.kids.find((p) => p.id === k.id) : undefined;
    const kid: Kid = { id: old?.id ?? gen.id(), name: k.name };
    if (k.phone) kid.phone = k.phone;
    return { ...kid, ...nextKidSlug(old, k.slug) };
  });
  const cars: Car[] = input.cars.map((c) => {
    const old = c.id ? prev?.cars.find((p) => p.id === c.id) : undefined;
    const car: Car = { id: old?.id ?? gen.id(), label: c.label, seats: c.seats };
    if (c.color) car.color = c.color;
    if (c.plate) car.plate = c.plate;
    if (c.photoId) car.photoId = c.photoId;
    return car;
  });
  return { ...base, name: input.name, parents: input.parents.map((p) => ({ ...p })), address: input.address, kids, cars };
}

export function validateEventInput(input: unknown): Validated<EventInput> {
  if (!isObj(input)) return invalid;
  const title = cleanText(input.title, 100);
  const place = cleanText(input.place ?? "", 100);
  const address = cleanText(input.address ?? "", 200);
  if (!title || place === null || address === null) return invalid;
  if (!isDate(input.date) || !isTime(input.start) || !isTime(input.returnTime)) return invalid;
  const value: EventInput = { title, date: input.date, start: input.start, returnTime: input.returnTime, place, address };
  const cover = optStr(input.coverImageId, 64);
  if (cover === null) return invalid;
  if (cover) value.coverImageId = cover;
  return { ok: true, value };
}

export function createEventState(input: EventInput, meta: { id: string; hostFamilyId: string; now: number }): EventState {
  return {
    ...input,
    id: meta.id,
    hostFamilyId: meta.hostFamilyId,
    createdAt: meta.now,
    version: 1,
    kidPlans: {},
    offers: { out: [], back: [] },
  };
}
