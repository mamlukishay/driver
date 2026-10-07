import { describe, expect, test } from "bun:test";
import { familySecret, formatFamilyKey, groupId, ID_ALPHABET, isId, kidToken, newId, parseFamilyKey, sha256hex } from "./ids.ts";

describe("ids", () => {
  test("lengths and alphabet", () => {
    expect(groupId()).toHaveLength(10);
    expect(kidToken()).toHaveLength(12);
    expect(familySecret()).toHaveLength(24);
    const id = newId(2000);
    for (const ch of id) expect(ID_ALPHABET).toContain(ch);
    expect(/[01ilo]/.test(ID_ALPHABET)).toBe(false);
    expect(new Set(id).size).toBe(ID_ALPHABET.length);
  });

  test("ids don't collide in practice", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => groupId()));
    expect(ids.size).toBe(1000);
  });

  test("sha256hex", async () => {
    expect(await sha256hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("family key round-trip and rejection", () => {
    const secret = familySecret();
    expect(parseFamilyKey(formatFamilyKey("fam23456", secret))).toEqual({ familyId: "fam23456", secret });
    for (const bad of [null, "", "nodot", ".x", "fam.short", `fa m.${secret}`, `fam.${secret}x`]) expect(parseFamilyKey(bad)).toBeNull();
    expect(isId("abc", 3)).toBe(true);
    expect(isId("ab0")).toBe(false);
  });
});
