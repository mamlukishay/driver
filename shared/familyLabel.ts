/**
 * Telling apart families with the same surname. Shared returns the parts; the UI (src/i18n)
 * formats them ("משפחת כהן (נועה, טל)").
 */
import { isJunkName } from "./validate.ts";

export interface LabelFamily {
  id: string;
  name: string;
  kids: readonly { name: string }[];
  parents: readonly { name: string }[];
  address?: string;
  createdAt?: number;
}

export interface FamilyLabelParts {
  /** The surname as stored (see `familyDisplayName` for missing names). */
  name: string;
  /** Disambiguator (kid names, parent first name, street), only while the name collides. */
  extra?: string[];
  /** Last resort: 1-based position by creation order among same-named families. */
  ordinal?: number;
}

export const normalizeFamilyName = (name: string) => (typeof name === "string" ? name : "").trim().replace(/\s+/g, " ").toLowerCase();

const clean = (v: unknown) => (isJunkName(v) ? "" : (v as string).trim());
const firstKids = (f: LabelFamily) => f.kids.slice(0, 2).map((k) => clean(k.name)).filter(Boolean);
const firstName = (f: Pick<LabelFamily, "parents">) => clean(f.parents?.[0]?.name).split(/\s+/)[0] ?? "";

/**
 * The family's name for display. Validation never stores a blank name, but legacy or corrupt data
 * (missing, blank, "undefined", "null") falls back to the first parent's first name, then "?".
 */
export function familyDisplayName(f: Pick<LabelFamily, "name" | "parents">): string {
  return isJunkName(f.name) ? firstName(f) || "?" : f.name;
}
/** The street: address text before the first digit or comma. */
export const streetOf = (address: string | undefined) => (address ?? "").split(/[\d,]/)[0]!.trim();

/** Disambiguator candidates, from shortest to longest: kids → + parent → + street. */
function levels(f: LabelFamily): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const part of [firstKids(f), [firstName(f)], [streetOf(f.address)]]) {
    const add = part.filter(Boolean);
    if (add.length === 0) continue; // an empty step tells nobody apart
    cur = [...cur, ...add];
    out.push(cur);
  }
  return out;
}

const key = (parts: string[]) => parts.map((p) => p.toLowerCase()).join("\u0000");

/**
 * "משפחת X" when the name is unique in the group. Otherwise each step applies only while the label
 * still collides: first 2 kid names → + a parent's first name → + street → a stable ordinal by
 * creation order.
 */
export function familyLabel(family: LabelFamily, all: readonly LabelFamily[]): FamilyLabelParts {
  const name = familyDisplayName(family);
  const norm = normalizeFamilyName(name);
  const same = all.filter((f) => normalizeFamilyName(familyDisplayName(f)) === norm);
  if (!same.some((f) => f.id === family.id)) same.push(family);
  const twins = same.filter((f) => f.id !== family.id);
  if (twins.length === 0) return { name };

  const mine = levels(family);
  const theirs = twins.map(levels);
  for (let i = 0; i < mine.length; i++) {
    const k = key(mine[i]!);
    // A twin with fewer steps keeps showing its longest label.
    if (!theirs.some((t) => t.length > 0 && key(t[Math.min(i, t.length - 1)]!) === k)) return { name, extra: mine[i]! };
  }
  const order = [...same].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || all.indexOf(a) - all.indexOf(b) || a.id.localeCompare(b.id));
  return { name, ordinal: order.findIndex((f) => f.id === family.id) + 1 };
}

/** Families already in the group whose name matches `name` (trimmed, case-insensitive). */
export function sameNameFamilies<T extends LabelFamily>(name: string, all: readonly T[]): T[] {
  const key = normalizeFamilyName(name);
  return key ? all.filter((f) => normalizeFamilyName(f.name) === key) : [];
}
