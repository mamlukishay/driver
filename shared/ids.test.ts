import { describe, expect, test } from "bun:test";
import { groupId, ID_ALPHABET, isId, newId } from "./ids.ts";

describe("ids", () => {
  test("lengths and alphabet", () => {
    expect(groupId()).toHaveLength(10);
    const id = newId(2000);
    for (const ch of id) expect(ID_ALPHABET).toContain(ch);
    expect(/[01ilo]/.test(ID_ALPHABET)).toBe(false);
    expect(new Set(id).size).toBe(ID_ALPHABET.length);
  });

  test("ids don't collide in practice", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => groupId()));
    expect(ids.size).toBe(1000);
  });

  test("isId", () => {
    expect(isId("abc", 3)).toBe(true);
    expect(isId("ab0")).toBe(false);
    expect(isId("")).toBe(false);
  });
});
