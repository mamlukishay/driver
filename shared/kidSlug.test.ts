import { describe, expect, test } from "bun:test";
import { kidKeys, kidSlugClash, MAX_SLUG_ALIASES, nextKidSlug, resolveKid, takenKidKeys } from "./kidSlug.ts";
import { isKidSlug } from "./slug.ts";
import type { Family, Kid } from "./types.ts";
import { buildFamily, validateFamilyInput } from "./validate.ts";

const fam = (id: string, kids: (Kid & { kidToken?: string })[]): Family => ({
  id,
  name: id,
  color: 0,
  parents: [{ name: "P", phone: "+972501234567" }],
  address: "",
  kids,
  cars: [],
  createdAt: 0,
});

describe("isKidSlug", () => {
  test("2–30 chars of a-z, 0-9, hyphen; no hyphen at either end", () => {
    for (const ok of ["tu", "tuni", "toni-2", "a1", "x".repeat(30)]) expect(isKidSlug(ok)).toBe(true);
    for (const bad of ["t", "-tuni", "tuni-", "Tuni", "תוני", "tu ni", "x".repeat(31), "", 7]) expect(isKidSlug(bad)).toBe(false);
  });
});

describe("resolveKid", () => {
  test("current slug, then alias, then id, then legacy token", () => {
    // Each kid's id / alias / token collides with another kid's key one step earlier in the order.
    const fams = [
      fam("f1", [{ id: "aaaa1111", name: "A", slug: "tuni", slugAliases: ["toni"] }]),
      fam("f2", [{ id: "toni", name: "B", kidToken: "aaaa1111" }]),
      fam("f3", [{ id: "cccc3333", name: "C", slug: "noa", kidToken: "legacy0token" }]),
    ];
    expect(resolveKid(fams, "tuni")?.kid.name).toBe("A");
    expect(resolveKid(fams, "toni")?.kid.name).toBe("A"); // alias beats another kid's id
    expect(resolveKid(fams, "aaaa1111")?.kid.name).toBe("A"); // id beats another kid's token
    expect(resolveKid(fams, "legacy0token")?.kid.name).toBe("C");
    expect(resolveKid(fams, "cccc3333")?.family.id).toBe("f3");
    expect(resolveKid(fams, "nobody")).toBeNull();
  });
});

describe("nextKidSlug (rename keeps old links)", () => {
  test("absent keeps, a new slug moves the old one into the aliases, \"\" clears", () => {
    expect(nextKidSlug(undefined, undefined)).toEqual({});
    expect(nextKidSlug(undefined, "")).toEqual({});
    expect(nextKidSlug(undefined, "tuni")).toEqual({ slug: "tuni" });
    expect(nextKidSlug({ slug: "tuni" }, undefined)).toEqual({ slug: "tuni" });
    expect(nextKidSlug({ slug: "tuni" }, "toni")).toEqual({ slug: "toni", slugAliases: ["tuni"] });
    expect(nextKidSlug({ slug: "toni", slugAliases: ["tuni"] }, "")).toEqual({ slugAliases: ["tuni", "toni"] });
    // Taking an old name back removes it from the aliases.
    expect(nextKidSlug({ slug: "toni", slugAliases: ["tuni"] }, "tuni")).toEqual({ slug: "tuni", slugAliases: ["toni"] });
  });
  test("keeps at most MAX_SLUG_ALIASES, dropping the oldest", () => {
    let k: Pick<Kid, "slug" | "slugAliases"> = { slug: "s0" };
    for (let n = 1; n <= MAX_SLUG_ALIASES + 3; n++) k = nextKidSlug(k, `s${n}`);
    expect(k.slugAliases).toHaveLength(MAX_SLUG_ALIASES);
    expect(k.slugAliases![0]).toBe("s3");
  });
  test("buildFamily: a renamed kid still resolves by its old slug and its id", () => {
    const gen = { id: () => "kid00001" };
    const base = { id: "fam1", color: 0, createdAt: 0 };
    const v1 = validateFamilyInput({ name: "Cohen", parents: [{ name: "P", phone: "0501234567" }], kids: [{ name: "תוני", slug: "toni" }] });
    if (!v1.ok) throw new Error("invalid");
    const f1 = buildFamily(v1.value, base, null, gen);
    expect(f1.kids[0]).toEqual({ id: "kid00001", name: "תוני", slug: "toni" });
    const v2 = validateFamilyInput({ ...v1.value, kids: [{ id: "kid00001", name: "תוני", slug: "tuni" }] });
    if (!v2.ok) throw new Error("invalid");
    const f2 = buildFamily(v2.value, base, f1, gen);
    expect(f2.kids[0]).toEqual({ id: "kid00001", name: "תוני", slug: "tuni", slugAliases: ["toni"] });
    for (const p of ["tuni", "toni", "kid00001"]) expect(resolveKid([f2], p)?.kid.id).toBe("kid00001");
    // Saving without `slug` (e.g. the cars page re-sending kids) keeps both.
    const v3 = validateFamilyInput({ ...v1.value, kids: [{ id: "kid00001", name: "תוני" }] });
    if (!v3.ok) throw new Error("invalid");
    expect(buildFamily(v3.value, base, f2, gen).kids[0]).toEqual(f2.kids[0]!);
  });
  test("validateFamilyInput: slug must be a kid slug or \"\"", () => {
    const input = (slug: unknown) => ({ name: "C", parents: [{ name: "P", phone: "0501234567" }], kids: [{ name: "K", slug }] });
    expect(validateFamilyInput(input("tuni")).ok).toBe(true);
    expect(validateFamilyInput(input("")).ok).toBe(true);
    expect(validateFamilyInput(input("Tuni!")).ok).toBe(false);
    expect(validateFamilyInput(input("t")).ok).toBe(false);
    expect(validateFamilyInput(input(5)).ok).toBe(false);
  });
});

describe("uniqueness", () => {
  const group = [
    fam("f1", [{ id: "aaaa1111", name: "A", slug: "tuni", slugAliases: ["toni"] }]),
    fam("f2", [{ id: "bbbb2222", name: "B", kidToken: "oldtoken" }]),
  ];
  test("kidKeys / takenKidKeys", () => {
    expect(kidKeys(group[0]!.kids[0]!)).toEqual(["tuni", "toni", "aaaa1111"]);
    expect([...takenKidKeys(group)].sort()).toEqual(["aaaa1111", "bbbb2222", "oldtoken", "toni", "tuni"]);
    expect([...takenKidKeys(group, ["aaaa1111"])].sort()).toEqual(["bbbb2222", "oldtoken"]);
  });
  test("another kid's slug, alias, id or token is taken; the kid's own old names are not", () => {
    const f2 = (slug: string) => fam("f2", [{ id: "bbbb2222", name: "B", slug }]);
    expect(kidSlugClash(group, f2("tuni"))).toBe("tuni");
    expect(kidSlugClash(group, f2("toni"))).toBe("toni");
    expect(kidSlugClash(group, f2("aaaa1111"))).toBe("aaaa1111");
    expect(kidSlugClash(group, f2("noa"))).toBeNull();
    // f1 renaming its own kid back to an alias: free.
    expect(kidSlugClash(group, fam("f1", [{ id: "aaaa1111", name: "A", slug: "toni", slugAliases: ["tuni"] }]))).toBeNull();
    // Two kids of the same family with one name.
    expect(
      kidSlugClash(group, fam("f3", [
        { id: "c1", name: "C", slug: "twin" },
        { id: "c2", name: "D", slug: "twin" },
      ])),
    ).toBe("twin");
  });
});
