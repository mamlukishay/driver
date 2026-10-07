import { describe, expect, test } from "bun:test";
import { groupId } from "./ids.ts";
import { eventSlugBase, firstFreeSlug, isSlug, slugify, suggestGroupSlug } from "./slug.ts";

describe("slugs", () => {
  test("isSlug", () => {
    for (const ok of ["abc", "class-4b", "oct-16-birthday-2", "a".repeat(40), groupId()]) expect(isSlug(ok)).toBe(true);
    for (const bad of ["ab", "a".repeat(41), "-abc", "abc-", "Abc", "כיתה", "a b c", "a_bc", "", null, 5]) expect(isSlug(bad)).toBe(false);
  });

  test("slugify keeps latin letters and digits", () => {
    expect(slugify("Class 4B!")).toBe("class-4b");
    expect(slugify("כיתה ד׳ 2")).toBe("2");
    expect(slugify("  --Hi--There-- ")).toBe("hi-there");
    expect(slugify("שלום")).toBe("");
  });

  test("suggestGroupSlug", () => {
    expect(suggestGroupSlug("Class 4B")).toBe("class-4b");
    expect(suggestGroupSlug("כיתה ד׳ 2", () => "x7k2")).toBe("group-x7k2");
    expect(isSlug(suggestGroupSlug("כדורגל"))).toBe(true);
  });

  test("eventSlugBase", () => {
    expect(eventSlugBase("2026-10-16")).toBe("oct-16");
    expect(eventSlugBase("2026-01-05", "Birthday Party")).toBe("jan-5-birthday-party");
    expect(eventSlugBase("2026-12-31", "יום הולדת")).toBe("dec-31");
  });

  test("firstFreeSlug appends -2, -3 and stays within 40 chars", () => {
    const taken = new Set(["oct-16", "oct-16-2"]);
    expect(firstFreeSlug("oct-16", (s) => taken.has(s))).toBe("oct-16-3");
    expect(firstFreeSlug("nov-1", (s) => taken.has(s))).toBe("nov-1");
    const long = "a".repeat(40);
    const s = firstFreeSlug(long, (x) => x === long)!;
    expect(s).toBe(`${"a".repeat(38)}-2`);
    expect(isSlug(s)).toBe(true);
  });
});
