import { describe, expect, test } from "bun:test";
import { applyAction } from "./actions.ts";
import type { Action, EventState, LogEntry } from "./types.ts";
import { familyPrivate, familyPublic, kidView, viewFor } from "./view.ts";
import { A, B, baseEvent, C, ctx, deepFreeze, FAMILIES } from "./test/fixtures.ts";

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

describe("viewFor: everyone sees everything in the group", () => {
  const requesters = ["fama", "famb", "famc", "famd"];
  test("every member sees all parents' phones, kids' phones and addresses", () => {
    for (const r of requesters) {
      const v = viewFor(state, FAMILIES, r);
      expect(v.me).toBe(r);
      for (const f of FAMILIES) {
        const fv = v.families.find((x) => x.id === f.id)!;
        expect(fv.parents).toEqual(f.parents);
        expect(fv.address).toBe(f.address);
        for (const k of f.kids) expect(fv.kids.find((x) => x.id === k.id)!.phone).toBe(k.phone);
      }
    }
  });

  test("a non-member (or anonymous) gets the same group view, with me = null", () => {
    const member = viewFor(state, FAMILIES, "fama");
    for (const r of [null, "stranger"]) {
      const v = viewFor(state, FAMILIES, r);
      expect(v.me).toBeNull();
      expect(v.families).toEqual(member.families);
    }
  });

  test("names, colors and cars are visible to everyone (even anonymous)", () => {
    const v = viewFor(state, FAMILIES, null);
    expect(v.me).toBeNull();
    expect(v.families.map((f) => [f.name, f.color, f.cars.length])).toEqual([["Cohen", 0, 1], ["Levi", 1, 1], ["Mizrahi", 2, 0], ["Peretz", 3, 1]]);
    expect(JSON.stringify(v)).not.toContain("keyHash");
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
  test("public carries phones and address", () => {
    const p = familyPublic(A);
    expect(p).toEqual({ ...A, kids: A.kids.map((k) => ({ ...k })) });
  });
  test("strips fields older versions stored", () => {
    const legacy = { ...B, keyHash: "h", kids: B.kids.map((k) => ({ ...k, kidToken: "t" })) };
    const p = familyPrivate(legacy);
    expect("keyHash" in p).toBe(false);
    expect("kidToken" in p.kids[0]!).toBe(false);
    expect(p.address).toBe(B.address);
  });
});

describe("kidView", () => {
  const group = { id: "grp", name: "Class", createdAt: 0, version: 1 };
  const past = deepFreeze({ ...baseEvent(), id: "old", date: "2026-01-01" });

  test("unknown kid id → null", () => {
    expect(kidView(group, FAMILIES, [state], "nope", "2026-10-07")).toBeNull();
  });

  test("shows the ride per leg with the driver's phone, skips past events", () => {
    const v = kidView(group, FAMILIES, [past, state], C.kids[0]!.id, "2026-10-07")!;
    expect(v.kid).toEqual({ id: "c1", name: "Yael", familyId: "famc", familyName: "Mizrahi", color: 2 });
    expect(v.events.map((e) => e.id)).toEqual(["ev1"]);
    const e = v.events[0]!;
    expect(e.legs.out).toEqual({ needed: true, ride: null });
    expect(e.legs.back.ride).toMatchObject({ offerId: "o2", departAt: "13:00", car: { label: "Kia" }, started: false, picked: false, ready: false });
    expect(e.legs.back.ride!.driver.parents).toEqual(B.parents);
  });
});
