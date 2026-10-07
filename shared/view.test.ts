import { describe, expect, test } from "bun:test";
import { applyAction } from "./actions.ts";
import type { Action, EventState, FamilyView, LogEntry } from "./types.ts";
import { familyPrivate, familyPublic, kidView, viewFor } from "./view.ts";
import { A, B, baseEvent, C, ctx, D, deepFreeze, FAMILIES } from "./test/fixtures.ts";

function chain(steps: [string, Action][]): EventState {
  let s = baseEvent();
  const c = ctx();
  for (const [actor, a] of steps) {
    const r = applyAction(s, c, a, actor, 0);
    if (!r.ok) throw new Error(r.error);
    s = deepFreeze(r.state);
  }
  return s;
}

/** A (host) drives out with b1 + a1; B drives back with c1. D is unrelated. */
const state = chain([
  ["fama", { type: "offerCar", leg: "out", carId: "cara", seats: 4, departAt: "09:30" }],
  ["famb", { type: "offerCar", leg: "back", carId: "carb", seats: 3, departAt: "13:00" }],
  ["famb", { type: "seatKid", offerId: "o1", kidId: "b1" }],
  ["fama", { type: "seatKid", offerId: "o1", kidId: "a1" }],
  ["famc", { type: "seatKid", offerId: "o2", kidId: "c1" }],
]);

type Field = "parents" | "kidPhone" | "address";
const fieldOf = (v: FamilyView, field: Field, kidId?: string): boolean => {
  if (field === "parents") return v.parents.every((p) => p.phone !== undefined);
  if (field === "address") return v.address !== undefined;
  return v.kids.find((k) => k.id === kidId)!.phone !== undefined;
};

// [target family, field, kidId?, requesters who may see it]
const TABLE: [string, Field, string | undefined, string[]][] = [
  ["famb", "parents", undefined, ["fama", "famb", "famc"]], // A: driver of b1 · C: c1 rides with B
  ["fama", "parents", undefined, ["fama", "famb"]], // B: passenger family of A's car
  ["famc", "parents", undefined, ["fama", "famb", "famc"]], // A: host · B: driver of c1
  ["famd", "parents", undefined, ["fama", "famd"]], // host only
  ["famb", "kidPhone", "b1", ["fama", "famb"]], // only b1's driver (A)
  ["famc", "kidPhone", "c1", ["famb", "famc"]], // host does not see kids' phones
  ["fama", "kidPhone", "a1", ["fama"]], // a1 rides with own family
  ["famb", "address", undefined, ["fama", "famb"]],
  ["famc", "address", undefined, ["famb", "famc"]], // host does not see addresses
  ["fama", "address", undefined, ["fama"]],
  ["famd", "address", undefined, ["famd"]],
];

describe("viewFor visibility", () => {
  const requesters = ["fama", "famb", "famc", "famd", null, "stranger"];
  for (const [target, field, kidId, allowed] of TABLE) {
    test(`${target}.${field}${kidId ? `(${kidId})` : ""} visible to ${allowed.join(",")}`, () => {
      for (const r of requesters) {
        const v = viewFor(state, FAMILIES, r).families.find((f) => f.id === target)!;
        expect([r, fieldOf(v, field, kidId)]).toEqual([r, allowed.includes(r as string)]);
      }
    });
  }

  test("names, colors and cars are visible to everyone (even anonymous)", () => {
    const v = viewFor(state, FAMILIES, null);
    expect(v.me).toBeNull();
    expect(v.families.map((f) => [f.name, f.color, f.cars.length])).toEqual([["Cohen", 0, 1], ["Levi", 1, 1], ["Mizrahi", 2, 0], ["Peretz", 3, 1]]);
    expect(JSON.stringify(v)).not.toContain("hash-");
    expect(JSON.stringify(v)).not.toContain("token");
  });

  test("kid without a phone never gets a phone field", () => {
    const v = viewFor(state, FAMILIES, "fama").families.find((f) => f.id === "fama")!;
    expect(v.kids.find((k) => k.id === "a2")).toEqual({ id: "a2", name: "Tal" });
  });

  test("includes gaps, waiting lists and the log tail without inverses", () => {
    const log: LogEntry[] = Array.from({ length: 60 }, (_, i) => ({ id: `l${i}`, eventId: "ev1", at: i, familyId: "fama", action: { type: "startRun", offerId: "o1" }, inverse: [] }));
    const v = viewFor(state, FAMILIES, "famb", log);
    expect(v.waiting).toEqual({ out: ["a2", "c1"], back: ["a1", "b1"] });
    expect(v.gaps.out).toMatchObject({ need: 4, seats: 4, seated: 2 });
    expect(v.log).toHaveLength(50);
    expect(v.log[0]!.id).toBe("l10");
    expect("inverse" in v.log[0]!).toBe(false);
  });

  test("returns copies, not references into state", () => {
    const v = viewFor(state, FAMILIES, "fama");
    v.offers.out[0]!.kidIds.push("x");
    expect(state.offers.out[0]!.kidIds).toEqual(["b1", "a1"]);
  });
});

describe("familyPublic / familyPrivate", () => {
  test("public has no phones, address, tokens or keyHash", () => {
    const p = familyPublic(A);
    expect(p).toEqual({ id: "fama", name: "Cohen", color: 0, parents: [{ name: "parent-fama" }], kids: [{ id: "a1", name: "Noa" }, { id: "a2", name: "Tal" }], cars: A.cars });
  });
  test("private drops only keyHash", () => {
    const p = familyPrivate(B);
    expect("keyHash" in p).toBe(false);
    expect(p.kids[0]!.kidToken).toBe("tokenb1tokenb");
    expect(p.address).toBe(B.address);
  });
});

describe("kidView", () => {
  const group = { id: "grp", name: "Class", createdAt: 0, version: 1 };
  const past = deepFreeze({ ...baseEvent(), id: "old", date: "2026-01-01" });

  test("unknown token → null", () => {
    expect(kidView(group, FAMILIES, [state], "nope", "2026-10-07")).toBeNull();
  });

  test("shows the ride per leg with the driver's phone, skips past events", () => {
    const v = kidView(group, FAMILIES, [past, state], C.kids[0]!.kidToken, "2026-10-07")!;
    expect(v.kid).toEqual({ id: "c1", name: "Yael", familyId: "famc", familyName: "Mizrahi", color: 2 });
    expect(v.events.map((e) => e.id)).toEqual(["ev1"]);
    const e = v.events[0]!;
    expect(e.legs.out).toEqual({ needed: true, ride: null });
    expect(e.legs.back.ride).toMatchObject({ offerId: "o2", departAt: "13:00", car: { label: "Kia" }, started: false, picked: false, ready: false });
    expect(e.legs.back.ride!.driver.parents).toEqual(B.parents);
    expect(JSON.stringify(v)).not.toContain(D.parents[0]!.phone);
  });
});
