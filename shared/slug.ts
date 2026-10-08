/** Friendly, URL-safe English slugs for groups and events: lowercase a-z, 0-9 and hyphen. */
import { newId } from "./ids.ts";

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
/** 3–40 chars of [a-z0-9-], no leading/trailing hyphen. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

/** Lowercases and keeps only Latin letters/digits, joined by single hyphens. May return "". */
export function slugify(input: string, max = SLUG_MAX): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** A suggestion for a group's URL name: Latin letters/digits from the name, else `group-<4 random>`. */
export function suggestGroupSlug(name: string, rand: () => string = () => newId(4)): string {
  const s = slugify(name);
  return isSlug(s) ? s : `group-${rand()}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

/** `oct-16` from `yyyy-mm-dd`, plus `-<word>` when the optional English word slugifies to something. */
export function eventSlugBase(date: string, word?: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  const base = m ? `${MONTHS[Number(m[1]) - 1] ?? "day"}-${Number(m[2])}` : "event";
  const w = word ? slugify(word, 20) : "";
  return w ? `${base}-${w}` : base;
}

/** `base`, else `base-2`, `base-3`… (trimmed to fit SLUG_MAX); null if nothing free within `limit`. */
export function firstFreeSlug(base: string, taken: (slug: string) => boolean, limit = 50): string | null {
  if (!taken(base)) return base;
  for (let n = 2; n <= limit; n++) {
    const suffix = `-${n}`;
    const s = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken(s)) return s;
  }
  return null;
}

/** Async variant of `firstFreeSlug` (e.g. when "taken" means asking a Durable Object). */
export async function firstFreeSlugAsync(base: string, taken: (slug: string) => Promise<boolean>, limit = 20): Promise<string | null> {
  if (!(await taken(base))) return base;
  for (let n = 2; n <= limit; n++) {
    const suffix = `-${n}`;
    const s = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!(await taken(s))) return s;
  }
  return null;
}

/** A kid's link name (`/g/:group/kid/<slug>`): 2–30 chars of [a-z0-9-], no leading/trailing hyphen. */
export const KID_SLUG_MAX = 30;
export const KID_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;

export function isKidSlug(value: unknown): value is string {
  return typeof value === "string" && KID_SLUG_RE.test(value);
}
