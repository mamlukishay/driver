import { describe, expect, test } from "bun:test";
import { applyAction, loggedAction, undo, type ActionCtx, type ApplyResult } from "./actions.ts";
import { offerDriver, offerDriverId, withParentIds } from "./drivers.ts";
import type { Action, EventState, Family, LogEntry } from "./types.ts";
import { kidView } from "./view.ts";
import { A, B, baseEvent, deepFreeze } from "./test/fixtures.ts";

const NOW = 1_000_000;

/** E: two people (mom, dad) and two cars; one kid. */
const E: Family = deepFreeze({
  id: "fame",
  name: "Katz",
  color: 4,
  parents: [
    { id: "mom", name: "Dana", phone: "+972521000005" },
    { id: "dad", name: "Avi", phone: "+972521000006" },
  ],
  address: "",
  kids: [{ id: "e1", name: "Gil" }],
  cars: [
    { id: "care1", label: "Mazda", seats: 4 },
    { id: "care2", label: "Kia", seats: 3 },
  ],
  createdAt: 0,
});
const FAMILIES = deepFreeze([A, B, E]);

function ctx(ids: string[] = ["o1", "o2", "o3", "o4"]): ActionCtx {
  const queue = [...ids];
  return { families: FAMILIES, newId: () => queue.shift() ?? "ox" };
}
const start = () => baseEvent({ kidPlans: { ...baseEvent().kidPlans, e1: { rsvp: "yes", out: true, back: true } } });

function ok(r: ApplyResult): EventState {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return deepFreeze(r.state);
}
const err = (r: ApplyResult) => (r.ok ? "ok" : r.error);
const offer = (carId: string, driverId: string, leg: "out" | "back" = "out"): Action => ({ type: "offerCar", leg, carId, driverId, seats: 2, departAt: "09:00" });
const run = (actions: Action[], s = start(), c = ctx()) => actions.reduce((st, a) => ok(applyAction(st, c, a, "fame", NOW)), s);
const body = (s: EventState) => ({ ...s, version: 0 });

describe("offerDriver / offerDriverId", () => {
  test("the offer's driver while they are in the family, else the first person", () => {
    expect(offerDriverId({ driverId: "dad" }, E)).toBe("dad");
    expect(offerDriver({ driverId: "dad" }, E)?.name).toBe("Avi");
    expect(offerDriverId({}, E)).toBe("mom");
    expect(offerDriverId({ driverId: "gone" }, E)).toBe("mom");
    expect(offerDriverId({ driverId: "dad" }, undefined)).toBeUndefined();
    expect(offerDriver({}, { parents: [] })).toBeUndefined();
  });
});

describe("withParentIds (families stored before drivers)", () => {
  test("assigns p0, p1, … by index to people without ids; leaves complete families as they are", () => {
    const legacy = { ...E, parents: [{ name: "Dana", phone: "+972521000005" }, { name: "Avi", phone: "+972521000006" }] } as unknown as Family;
    const fixed = withParentIds(legacy);
    expect(fixed.parents.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(withParentIds(legacy).parents).toEqual(fixed.parents);
    expect(legacy.parents[0]).not.toHaveProperty("id");
    expect(withParentIds(E)).toBe(E);
    const mixed = { ...E, parents: [{ id: "x", name: "A", phone: "" }, { name: "B", phone: "" }] } as unknown as Family;
    expect(withParentIds(mixed).parents.map((p) => p.id)).toEqual(["x", "p1"]);
  });
});

describe("offerCar with drivers", () => {
  test("stores the driver; a family drives two cars on one leg with two drivers", () => {
    const s = run([offer("care1", "mom"), offer("care2", "dad")]);
    expect(s.offers.out.map((o) => [o.carId, o.driverId])).toEqual([["care1", "mom"], ["care2", "dad"]]);
  });

  test("the same driver or the same car twice on a leg is invalid; other legs are fine", () => {
    const s = run([offer("care1", "mom")]);
    expect(err(applyAction(s, ctx(["o2"]), offer("care2", "mom"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(s, ctx(["o2"]), offer("care1", "dad"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(s, ctx(["o2"]), offer("care1", "mom", "back"), "fame", NOW))).toBe("ok");
  });

  test("a driver from another family, or unknown, is invalid; another family's car is forbidden", () => {
    expect(err(applyAction(start(), ctx(), offer("care1", "p-fama"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(start(), ctx(), offer("care1", "nobody"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(start(), ctx(), { ...offer("care1", "mom"), driverId: 7 } as unknown as Action, "fame", NOW))).toBe("invalid");
    expect(err(applyAction(start(), ctx(), offer("cara", "mom"), "fame", NOW))).toBe("forbidden");
  });

  test("an older client without driverId: the first person drives", () => {
    const { driverId: _d, ...old } = offer("care1", "mom") as Extract<Action, { type: "offerCar" }>;
    const s = ok(applyAction(start(), ctx(), old as Action, "fame", NOW));
    expect(s.offers.out[0]!.driverId).toBe("mom");
  });

  test("a legacy offer (no driverId) counts as the first person", () => {
    const legacy = start();
    const s = deepFreeze({ ...legacy, offers: { out: [{ id: "old", familyId: "fame", carId: "care1", seats: 2, departAt: "09:00", kidIds: [] }], back: [] } });
    expect(err(applyAction(s, ctx(), offer("care2", "mom"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(s, ctx(), offer("care2", "dad"), "fame", NOW))).toBe("ok");
  });
});

describe("updateOffer driver", () => {
  const upd = (driverId: string, more: object = {}): Action => ({ type: "updateOffer", offerId: "o1", driverId, ...more });

  test("changes the driver; undo restores them", () => {
    const before = run([offer("care1", "mom")]);
    const r = applyAction(before, ctx(), upd("dad", { seats: 3 }), "fame", NOW);
    const after = ok(r);
    expect(after.offers.out[0]).toMatchObject({ driverId: "dad", seats: 3 });
    const entry: LogEntry = deepFreeze({ id: "l1", eventId: "ev1", at: NOW, familyId: "fame", action: upd("dad"), inverse: r.ok ? r.inverse : [] });
    expect(body(ok(undo(after, ctx(), entry, "fame", NOW)))).toEqual(body(before));
  });

  test("undo of a legacy offer's driver change brings back no driverId", () => {
    const before = deepFreeze({ ...start(), offers: { out: [{ id: "o1", familyId: "fame", carId: "care1", seats: 2, departAt: "09:00", kidIds: [] }], back: [] } });
    const r = applyAction(before, ctx(), upd("dad"), "fame", NOW);
    const after = ok(r);
    expect(after.offers.out[0]!.driverId).toBe("dad");
    const entry: LogEntry = deepFreeze({ id: "l1", eventId: "ev1", at: NOW, familyId: "fame", action: upd("dad"), inverse: r.ok ? r.inverse : [] });
    const back = ok(undo(after, ctx(), entry, "fame", NOW));
    expect(back.offers.out[0]).not.toHaveProperty("driverId");
    expect(body(back)).toEqual(body(before));
  });

  test("owner only; foreign driver, a driver busy on this leg, or an unchanged driver alone is invalid", () => {
    const s = run([offer("care1", "mom"), offer("care2", "dad")]);
    expect(err(applyAction(s, ctx(), upd("dad"), "famb", NOW))).toBe("forbidden");
    expect(err(applyAction(s, ctx(), upd("p-fama"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(s, ctx(), upd("dad"), "fame", NOW))).toBe("invalid");
    expect(err(applyAction(s, ctx(), upd("mom"), "fame", NOW))).toBe("invalid");
    // The same driver with another field is just that field.
    const same = applyAction(s, ctx(), upd("mom", { seats: 1 }), "fame", NOW);
    expect(same.ok && same.inverse.some((x) => x.type === "setOfferDriver")).toBe(false);
  });

  test("undo is stale when the old driver took another car on the leg meanwhile", () => {
    const before = run([offer("care1", "mom")]);
    const r = applyAction(before, ctx(["o2"]), upd("dad"), "fame", NOW);
    const after = run([offer("care2", "mom")], ok(r), ctx(["o2"]));
    const entry: LogEntry = deepFreeze({ id: "l1", eventId: "ev1", at: NOW, familyId: "fame", action: upd("dad"), inverse: r.ok ? r.inverse : [] });
    expect(err(undo(after, ctx(), entry, "fame", NOW))).toBe("stale");
  });

  test("the log keeps the driver only when it changed, with the previous one", () => {
    const s = run([offer("care1", "mom")]);
    const r = applyAction(s, ctx(), upd("dad", { seats: 3 }), "fame", NOW);
    if (!r.ok) throw new Error();
    expect(loggedAction(upd("dad", { seats: 3 }), r.inverse)).toEqual({ type: "updateOffer", offerId: "o1", seats: 3, driverId: "dad", prevDriverId: "mom" });
    const same = applyAction(s, ctx(), upd("mom", { seats: 3 }), "fame", NOW);
    if (!same.ok) throw new Error();
    expect(loggedAction(upd("mom", { seats: 3 }), same.inverse)).toEqual({ type: "updateOffer", offerId: "o1", seats: 3 });
  });

  test("setOfferDriver is system-only", () => {
    const s = run([offer("care1", "mom")]);
    expect(err(applyAction(s, ctx(), { type: "setOfferDriver", offerId: "o1", driverId: null }, "fame", NOW))).toBe("forbidden");
  });
});

describe("removeOffer undo with drivers", () => {
  test("restoring is stale when the driver or the car is taken on the leg meanwhile", () => {
    const before = run([offer("care1", "mom")]);
    const r = applyAction(before, ctx(), { type: "removeOffer", offerId: "o1" }, "fame", NOW);
    const entry: LogEntry = deepFreeze({ id: "l1", eventId: "ev1", at: NOW, familyId: "fame", action: { type: "removeOffer", offerId: "o1" }, inverse: r.ok ? r.inverse : [] });
    const sameDriver = run([offer("care2", "mom")], ok(r), ctx(["o2"]));
    expect(err(undo(sameDriver, ctx(), entry, "fame", NOW))).toBe("stale");
    const sameCar = run([offer("care1", "dad")], ok(r), ctx(["o2"]));
    expect(err(undo(sameCar, ctx(), entry, "fame", NOW))).toBe("stale");
    const other = run([offer("care2", "dad")], ok(r), ctx(["o2"]));
    expect(undo(other, ctx(), entry, "fame", NOW).ok).toBe(true);
  });
});

describe("kidView driver person", () => {
  const meta = { id: "g", name: "G", createdAt: 0, version: 1 };
  test("the kid sees the offer's driver; legacy offers show the first person", () => {
    const s = run([offer("care1", "dad"), { type: "seatKid", offerId: "o1", kidId: "e1" }]);
    const v = kidView(meta, FAMILIES, [s], "e1", "2026-01-01");
    expect(v!.events[0]!.legs.out.ride!.driver.person).toEqual({ name: "Avi", phone: "+972521000006" });

    const { driverId: _d, ...legacy } = s.offers.out[0]!;
    const old = { ...s, offers: { out: [legacy], back: [] } };
    expect(kidView(meta, FAMILIES, [old], "e1", "2026-01-01")!.events[0]!.legs.out.ride!.driver.person).toEqual({ name: "Dana", phone: "+972521000005" });
  });
});
