/**
 * Kid link names: which kid a `/g/:group/kid/<param>` URL means, and which names are free.
 * A kid answers to its current `slug`, its earlier slugs (`slugAliases`, so links already sent keep
 * working), its id, and (very old families) a legacy `kidToken`.
 */
import type { Family, Kid } from "./types.ts";

/** Most earlier slugs a kid keeps reserved (oldest dropped first). */
export const MAX_SLUG_ALIASES = 10;

type StoredKid = Kid & { kidToken?: string };

/** Every URL key a kid answers to. */
export function kidKeys(k: StoredKid): string[] {
  const out: string[] = [];
  if (k.slug) out.push(k.slug);
  if (k.slugAliases) out.push(...k.slugAliases);
  out.push(k.id);
  if (k.kidToken) out.push(k.kidToken);
  return out;
}

/**
 * The kid a URL param names. Order: a current slug, then an earlier slug (alias), then a kid id,
 * then a legacy token; so a rename can never be shadowed by an older key.
 */
export function resolveKid(families: readonly Family[], param: string): { family: Family; kid: Kid } | null {
  const kids = families.flatMap((family) => family.kids.map((kid) => ({ family, kid: kid as StoredKid })));
  const tests: ((k: StoredKid) => boolean)[] = [
    (k) => k.slug === param,
    (k) => !!k.slugAliases?.includes(param),
    (k) => k.id === param,
    (k) => k.kidToken === param,
  ];
  for (const t of tests) {
    const hit = kids.find((x) => t(x.kid));
    if (hit) return hit;
  }
  return null;
}

/** Keys used by every kid in the group except `exceptKidIds` (their own old names stay theirs to reuse). */
export function takenKidKeys(families: readonly Family[], exceptKidIds: readonly string[] = []): Set<string> {
  const taken = new Set<string>();
  for (const f of families) for (const k of f.kids) if (!exceptKidIds.includes(k.id)) for (const key of kidKeys(k)) taken.add(key);
  return taken;
}

/**
 * The first slug of `family`'s kids that another kid in the group already answers to (or that two of
 * its own kids share); null when all are free. `families` is the group as stored (the old copy of
 * `family`, if any, is ignored).
 */
export function kidSlugClash(families: readonly Family[], family: Family): string | null {
  const others = families.filter((f) => f.id !== family.id);
  const seen = new Map<string, string>(); // key → kid id, within this family
  for (const k of family.kids) for (const key of kidKeys(k)) if (!seen.has(key)) seen.set(key, k.id);
  const taken = takenKidKeys(others);
  for (const k of family.kids) {
    if (!k.slug) continue;
    if (taken.has(k.slug)) return k.slug;
    const owner = seen.get(k.slug);
    if (owner !== undefined && owner !== k.id) return k.slug;
  }
  return null;
}

/**
 * A kid's slug fields after an edit. `input` undefined keeps the current slug; "" clears it.
 * A slug that is replaced or cleared moves into the aliases; a slug taken back leaves them.
 */
export function nextKidSlug(prev: Pick<Kid, "slug" | "slugAliases"> | undefined, input: string | undefined): Pick<Kid, "slug" | "slugAliases"> {
  const slug = input === undefined ? prev?.slug : input || undefined;
  let aliases = [...(prev?.slugAliases ?? [])];
  if (prev?.slug && prev.slug !== slug && !aliases.includes(prev.slug)) aliases.push(prev.slug);
  if (slug) aliases = aliases.filter((a) => a !== slug);
  aliases = aliases.slice(-MAX_SLUG_ALIASES);
  const out: Pick<Kid, "slug" | "slugAliases"> = {};
  if (slug) out.slug = slug;
  if (aliases.length) out.slugAliases = aliases;
  return out;
}
