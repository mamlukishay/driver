import { describe, expect, test } from "bun:test";
import {
  mergeAccountGroups,
  parseCookies,
  parseSession,
  profileFromIdToken,
  safeNext,
  userKey,
  validAccountGroup,
  validSyncBody,
} from "./account.ts";

const g = (group: string, familyId: string, lastUsed: number) => ({ group, familyId, lastUsed });

describe("mergeAccountGroups", () => {
  test("newer lastUsed wins per group; union of both; most recent first", () => {
    const stored = [g("class-a", "fam1", 100), g("class-b", "fam2", 500)];
    const incoming = [g("class-a", "fam9", 300), g("class-b", "fam3", 200), g("club-c", "fam4", 50)];
    expect(mergeAccountGroups(stored, incoming)).toEqual([
      g("class-b", "fam2", 500),
      g("class-a", "fam9", 300),
      g("club-c", "fam4", 50),
    ]);
  });
  test("a tie keeps the incoming entry", () => {
    expect(mergeAccountGroups([g("class-a", "old", 7)], [g("class-a", "new", 7)])).toEqual([g("class-a", "new", 7)]);
  });
  test("caps the list, dropping the least recently used", () => {
    const many = Array.from({ length: 5 }, (_, i) => g(`grp-${i}`, "fam", i));
    expect(mergeAccountGroups(many, [], 3).map((x) => x.group)).toEqual(["grp-4", "grp-3", "grp-2"]);
  });
});

describe("validation", () => {
  test("a group entry needs a slug, a family id and a non-negative lastUsed", () => {
    expect(validAccountGroup(g("class-a", "abc234", 12.6))).toEqual(g("class-a", "abc234", 13));
    expect(validAccountGroup(g("Class A", "abc234", 1))).toBeNull();
    expect(validAccountGroup(g("class-a", "ABC", 1))).toBeNull();
    expect(validAccountGroup(g("class-a", "abc234", -1))).toBeNull();
    expect(validAccountGroup({ group: "class-a", familyId: "abc234" })).toBeNull();
    expect(validAccountGroup(null)).toBeNull();
  });
  test("sync body: a list of valid entries, capped", () => {
    expect(validSyncBody({ groups: [g("class-a", "abc234", 1)] })).toEqual([g("class-a", "abc234", 1)]);
    expect(validSyncBody({ groups: [] })).toEqual([]);
    expect(validSyncBody({ groups: [{ group: "x" }] })).toBeNull();
    expect(validSyncBody({})).toBeNull();
    expect(validSyncBody([])).toBeNull();
    expect(validSyncBody({ groups: Array.from({ length: 201 }, (_, i) => g(`grp-${i}`, "abc", 1)) })).toBeNull();
  });
});

describe("safeNext", () => {
  test("keeps same-origin paths", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/g/class-a?x=1#y")).toBe("/g/class-a?x=1#y");
  });
  test("rejects anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", "/a\\b", "/a\nb", null, 5]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});

describe("cookies and sessions", () => {
  test("parseCookies", () => {
    expect(parseCookies("a=1; tp_session=g:12.abc; a=2")).toEqual({ a: "1", tp_session: "g:12.abc" });
    expect(parseCookies(null)).toEqual({});
  });
  test("userKey", () => {
    expect(userKey("g", "1234567890")).toBe("g:1234567890");
    expect(userKey("dev", "alice")).toBe("dev:alice");
    expect(userKey("dev", "a b")).toBeNull();
    expect(userKey("g", "")).toBeNull();
  });
  test("parseSession splits at the last dot and checks both parts", () => {
    const token = "A".repeat(43);
    expect(parseSession(`g:123.${token}`)).toEqual({ key: "g:123", token });
    expect(parseSession(`x:123.${token}`)).toBeNull();
    expect(parseSession(`g:123.short`)).toBeNull();
    expect(parseSession(token)).toBeNull();
    expect(parseSession(undefined)).toBeNull();
  });
});

describe("profileFromIdToken", () => {
  const now = 1_800_000_000_000;
  const base = { iss: "https://accounts.google.com", aud: "client-1", sub: "1234", email: "a@b.c", name: "רונית", exp: now / 1000 + 60 };
  test("accepts Google's issuer and our audience", () => {
    expect(profileFromIdToken(base, "client-1", now)).toEqual({ sub: "1234", email: "a@b.c", name: "רונית" });
    expect(profileFromIdToken({ ...base, iss: "accounts.google.com", picture: "https://x/y.png" }, "client-1", now)?.picture).toBe(
      "https://x/y.png",
    );
  });
  test("rejects other issuers, audiences, expired tokens and bad subjects", () => {
    expect(profileFromIdToken({ ...base, iss: "https://evil.com" }, "client-1", now)).toBeNull();
    expect(profileFromIdToken({ ...base, aud: "client-2" }, "client-1", now)).toBeNull();
    expect(profileFromIdToken(base, "", now)).toBeNull();
    expect(profileFromIdToken({ ...base, exp: now / 1000 - 1 }, "client-1", now)).toBeNull();
    expect(profileFromIdToken({ ...base, sub: "a b" }, "client-1", now)).toBeNull();
  });
  test("falls back to the email's name part", () => {
    expect(profileFromIdToken({ ...base, name: undefined }, "client-1", now)?.name).toBe("a");
  });
});
