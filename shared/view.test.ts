import { describe, expect, test } from "bun:test";
import { applyAction } from "./actions.ts";
import type { Action, EventState, KidLegView, KidRide, LogEntry } from "./types.ts";
import { familyPrivate, familyPublic, kidLegStatus, kidView, legOver, pickupStops, viewFor } from "./view.ts";
import { A, B, baseEvent, C, ctx, deepFreeze, FAMILIES } from "./test/fixtures.ts";

function chain(steps: [string, Action][], start: EventState = baseEvent()): EventState {
  let s = start;
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

describe("kidView: live fields and per-event focus", () => {
  const group = { id: "grp", name: "Class", createdAt: 0, version: 1 };
  // A drives out: seating order b1 (Levi), a1 (Cohen), c1 (Mizrahi).
  const s0 = chain([
    ["fama", { type: "offerCar", leg: "out", carId: "cara", seats: 4, departAt: "09:30" }],
    ["famb", { type: "seatKid", offerId: "o1", kidId: "b1" }],
    ["fama", { type: "seatKid", offerId: "o1", kidId: "a1" }],
    ["famc", { type: "seatKid", offerId: "o1", kidId: "c1" }],
    ["fama", { type: "startRun", offerId: "o1" }],
    ["fama", { type: "setArrived", offerId: "o1", kidId: "b1", arrived: true }],
  ]);
  const ride = (st: EventState, kid: string) => kidView(group, FAMILIES, [st], kid, "2026-10-07")!.events[0]!.legs.out.ride!;

  test("arrived; the driver's own kid is on board from the start of the out leg", () => {
    expect(ride(s0, "b1")).toMatchObject({ started: true, arrived: true, picked: false, eta: null, ended: false });
    expect(ride(s0, "a1")).toMatchObject({ arrived: false, picked: true });
    expect(ride(s0, "c1")).toMatchObject({ arrived: false, picked: false });
  });

  test("eta is this kid's entry; ended follows the run", () => {
    const s1 = chain([["fama", { type: "setEta", offerId: "o1", kidIds: ["c1"], minutes: 7 }]], s0);
    expect(ride(s1, "c1").eta).toEqual({ at: 7 * 60_000, setAt: 0 });
    expect(ride(s1, "b1").eta).toBeNull();
    const s2 = chain([["fama", { type: "endRun", offerId: "o1", ended: true }]], s1);
    expect(ride(s2, "c1").ended).toBe(true);
    expect(ride(s2, "b1").ended).toBe(true);
  });

  test("eventId shows only that event, even when past; unknown id → no events", () => {
    const past = deepFreeze({ ...baseEvent(), id: "old", date: "2026-01-01" });
    expect(kidView(group, FAMILIES, [past, state], "c1", "2026-10-07", "old")!.events.map((e) => e.id)).toEqual(["old"]);
    expect(kidView(group, FAMILIES, [past, state], "c1", "2026-10-07", "nope")!.events).toEqual([]);
  });
});

describe("pickupStops", () => {
  const famOf = (k: string) => ({ a1: "A", a2: "A", b1: "B", c1: "C" })[k];
  test("out: one stop per family in seating order; back: one stop", () => {
    expect(pickupStops("out", ["b1", "a1", "c1", "a2"], famOf)).toEqual([["b1"], ["a1", "a2"], ["c1"]]);
    expect(pickupStops("back", ["b1", "a1"], famOf)).toEqual([["b1", "a1"]]);
    expect(pickupStops("back", [], famOf)).toEqual([]);
  });
});

describe("legOver", () => {
  const e = { date: "2026-10-20", start: "10:00", returnTime: "23:00" };
  test("out is over 30 min after start, back 90 min after the return time (across midnight)", () => {
    expect(legOver(e, "out", "2026-10-20T10:29")).toBe(false);
    expect(legOver(e, "out", "2026-10-20T10:30")).toBe(true);
    expect(legOver(e, "back", "2026-10-21T00:29")).toBe(false);
    expect(legOver(e, "back", "2026-10-21T00:30")).toBe(true);
    expect(legOver(e, "out", "2026-10-19T23:00")).toBe(false);
    expect(legOver(e, "back", "2026-11-01T08:00")).toBe(true);
  });
});

describe("kidLegStatus", () => {
  const r = (over: Partial<KidRide> = {}): KidRide => ({
    offerId: "o1",
    departAt: "09:30",
    driver: { familyId: "fama", name: "Cohen", color: 0, parents: A.parents },
    car: A.cars[0]!,
    started: false,
    picked: false,
    ready: false,
    arrived: false,
    eta: null,
    ended: false,
    ...over,
  });
  const leg = (ride: KidRide | null, needed = true): KidLegView => ({ needed, ride });

  test("each state", () => {
    expect(kidLegStatus(leg(null, false), false)).toBeNull();
    expect(kidLegStatus(leg(null), false)).toBe("waiting");
    expect(kidLegStatus(leg(r()), false)).toBe("assigned");
    expect(kidLegStatus(leg(r({ started: true })), false)).toBe("onTheWay");
    expect(kidLegStatus(leg(r({ started: true, arrived: true })), false)).toBe("arrived");
    expect(kidLegStatus(leg(r({ started: true, picked: true })), false)).toBe("picked");
    expect(kidLegStatus(leg(r({ started: true, picked: true })), true)).toBe("done");
    expect(kidLegStatus(leg(null), true)).toBe("done");
    expect(kidLegStatus(leg(r()), true)).toBe("done");
    expect(kidLegStatus(leg(r({ started: true })), true)).toBe("onTheWay");
    expect(kidLegStatus(leg(r({ started: true, arrived: true })), true)).toBe("arrived");
    expect(kidLegStatus(leg(null, false), true)).toBeNull();
  });

  test("an eta keeps the kid on the way (even when it has passed)", () => {
    const eta = { at: 1, setAt: 0 };
    expect(kidLegStatus(leg(r({ started: true, eta })), false)).toBe("onTheWay");
    expect(kidLegStatus(leg(r({ started: true, eta })), true)).toBe("onTheWay");
    expect(kidLegStatus(leg(r({ started: true, arrived: true, eta })), false)).toBe("arrived");
    expect(kidLegStatus(leg(r({ started: true, picked: true, eta })), false)).toBe("picked");
  });

  test("an ended run is done, picked or not, before the leg is over", () => {
    expect(kidLegStatus(leg(r({ started: true, picked: true, ended: true })), false)).toBe("done");
    expect(kidLegStatus(leg(r({ started: true, ended: true })), false)).toBe("done");
    expect(kidLegStatus(leg(r({ started: true, ended: true })), true)).toBe("done");
    expect(kidLegStatus(leg(r({ started: true, ended: true }), false), false)).toBeNull();
  });
});
