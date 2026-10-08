import { describe, expect, test } from "bun:test";
import { applyAction, loggedAction, undo, type ActionCtx, type ApplyResult } from "./actions.ts";
import type { Action, EventState, LogEntry } from "./types.ts";
import { baseEvent, ctx, deepFreeze } from "./test/fixtures.ts";

const NOW = 1_000_000;

function ok(r: ApplyResult): EventState {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return deepFreeze(r.state);
}

function err(r: ApplyResult) {
  return r.ok ? "ok" : r.error;
}

/** Applies a chain of [actor, action] steps; every step must succeed. */
function run(steps: [string, Action][], start = baseEvent(), c: ActionCtx = ctx()): EventState {
  return steps.reduce((s, [actor, a]) => ok(applyAction(s, c, a, actor, NOW)), start);
}

const offerA = (leg: "out" | "back" = "out", seats = 4): [string, Action] => ["fama", { type: "offerCar", leg, carId: "cara", driverId: "p-fama", seats, departAt: "09:30" }];
const offerB = (leg: "out" | "back" = "out", seats = 3): [string, Action] => ["famb", { type: "offerCar", leg, carId: "carb", driverId: "p-famb", seats, departAt: "09:40" }];
const seat = (actor: string, offerId: string, kidId: string): [string, Action] => [actor, { type: "seatKid", offerId, kidId }];

/** Strips the version so states before an action and after its undo compare equal. */
const body = (s: EventState) => ({ ...s, version: 0 });

describe("purity", () => {
  test("never mutates the (deep-frozen) input and bumps version", () => {
    const s0 = baseEvent();
    const snapshot = JSON.stringify(s0);
    const s1 = run([offerA(), seat("fama", "o1", "a1")], s0);
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(s1.version).toBe(3);
    expect(s1.offers.out[0]!.kidIds).toEqual(["a1"]);
  });

  test("failed action returns an error and no state", () => {
    const r = applyAction(baseEvent(), ctx(), { type: "removeOffer", offerId: "nope" }, "fama", NOW);
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  test("actor outside the group is forbidden", () => {
    expect(err(applyAction(baseEvent(), ctx(), offerA()[1], "stranger", NOW))).toBe("forbidden");
  });

  test("unknown or malformed actions are invalid", () => {
    expect(err(applyAction(baseEvent(), ctx(), { type: "nope" } as unknown as Action, "fama", NOW))).toBe("invalid");
    expect(err(applyAction(baseEvent(), ctx(), { type: "seatKid", offerId: "o1" } as unknown as Action, "fama", NOW))).toBe("invalid");
  });
});

describe("setKidPlan", () => {
  const plan = (kidId: string, rsvp: "yes" | "no", out: boolean, back: boolean): Action => ({ type: "setKidPlan", kidId, rsvp, out, back });

  test("own kid allowed, other family's kid forbidden, unknown kid not_found", () => {
    const s = ok(applyAction(baseEvent(), ctx(), plan("a1", "yes", false, true), "fama", NOW));
    expect(s.kidPlans.a1).toEqual({ rsvp: "yes", out: false, back: true });
    expect(err(applyAction(baseEvent(), ctx(), plan("b1", "no", false, false), "fama", NOW))).toBe("forbidden");
    expect(err(applyAction(baseEvent(), ctx(), plan("zz", "no", false, false), "fama", NOW))).toBe("not_found");
  });

  test("rsvp no clears both legs and unseats the kid everywhere", () => {
    const s = run([offerA("out"), offerA("back"), seat("famb", "o1", "b1"), seat("famb", "o2", "b1"), ["famb", plan("b1", "no", true, true)]]);
    expect(s.kidPlans.b1).toEqual({ rsvp: "no", out: false, back: false });
    expect(s.offers.out[0]!.kidIds).toEqual([]);
    expect(s.offers.back[0]!.kidIds).toEqual([]);
  });

  test("turning one leg off unseats only that leg", () => {
    const s = run([offerA("out"), offerA("back"), seat("famb", "o1", "b1"), seat("famb", "o2", "b1"), ["famb", plan("b1", "yes", false, true)]]);
    expect(s.offers.out[0]!.kidIds).toEqual([]);
    expect(s.offers.back[0]!.kidIds).toEqual(["b1"]);
  });

  test("rejects a bad rsvp", () => {
    expect(err(applyAction(baseEvent(), ctx(), { ...plan("a1", "yes", true, true), rsvp: "maybe" } as unknown as Action, "fama", NOW))).toBe("invalid");
  });
});

describe("offerCar", () => {
  test("own car allowed; someone else's car forbidden; unknown car not_found", () => {
    const s = run([offerA()]);
    expect(s.offers.out).toEqual([{ id: "o1", familyId: "fama", carId: "cara", driverId: "p-fama", seats: 4, departAt: "09:30", kidIds: [] }]);
    expect(err(applyAction(baseEvent(), ctx(), offerA()[1], "famb", NOW))).toBe("forbidden");
    expect(err(applyAction(baseEvent(), ctx(), { type: "offerCar", leg: "out", carId: "x", driverId: "p-fama", seats: 1, departAt: "09:00" }, "fama", NOW))).toBe("not_found");
  });

  test("one offer per family per leg; the other leg is fine", () => {
    const s = run([offerA("out")]);
    expect(err(applyAction(s, ctx(["o9"]), offerA("out")[1], "fama", NOW))).toBe("invalid");
    expect(ok(applyAction(s, ctx(["o9"]), offerA("back")[1], "fama", NOW)).offers.back).toHaveLength(1);
  });

  test("validates seats and time", () => {
    const bad: Partial<Extract<Action, { type: "offerCar" }>>[] = [{ seats: 5 }, { seats: 0 }, { seats: 1.5 }, { departAt: "9:30" }, { departAt: "24:00" }];
    for (const over of bad) expect(err(applyAction(baseEvent(), ctx(), { ...(offerA()[1] as object), ...over } as Action, "fama", NOW))).toBe("invalid");
  });
});

describe("updateOffer", () => {
  const upd = (seats?: number, departAt?: string): Action => ({ type: "updateOffer", offerId: "o1", ...(seats !== undefined && { seats }), ...(departAt && { departAt }) });

  test("owner only", () => {
    const s = run([offerA()]);
    expect(ok(applyAction(s, ctx(), upd(2, "08:00"), "fama", NOW)).offers.out[0]).toMatchObject({ seats: 2, departAt: "08:00" });
    expect(err(applyAction(s, ctx(), upd(2), "famb", NOW))).toBe("forbidden");
  });

  test("seats may not drop below the number seated", () => {
    const s = run([offerA(), seat("fama", "o1", "a1"), seat("fama", "o1", "a2")]);
    expect(err(applyAction(s, ctx(), upd(1), "fama", NOW))).toBe("invalid");
    expect(ok(applyAction(s, ctx(), upd(2), "fama", NOW)).offers.out[0]!.seats).toBe(2);
    expect(err(applyAction(s, ctx(), upd(), "fama", NOW))).toBe("invalid");
  });
});

describe("removeOffer", () => {
  test("owner only; its kids go back to waiting", () => {
    const s = run([offerA(), seat("famb", "o1", "b1")]);
    expect(err(applyAction(s, ctx(), { type: "removeOffer", offerId: "o1" }, "famb", NOW))).toBe("forbidden");
    const after = ok(applyAction(s, ctx(), { type: "removeOffer", offerId: "o1" }, "fama", NOW));
    expect(after.offers.out).toEqual([]);
    expect(after.kidPlans.b1).toEqual(s.kidPlans.b1!);
  });
});

describe("seatKid", () => {
  test("my kid into anyone's open offer", () => {
    const s = run([offerB(), seat("fama", "o1", "a1")]);
    expect(s.offers.out[0]!.kidIds).toEqual(["a1"]);
  });

  test("any kid who needs the leg into my offer", () => {
    expect(run([offerA(), seat("fama", "o1", "c1")]).offers.out[0]!.kidIds).toEqual(["c1"]);
  });

  test("neither my kid nor my offer is forbidden", () => {
    const s = run([offerB()]);
    expect(err(applyAction(s, ctx(), seat("famc", "o1", "a1")[1], "famc", NOW))).toBe("forbidden");
  });

  test("kid must have rsvp yes and need the leg", () => {
    const s = run([offerA("back"), ["fama", { type: "setKidPlan", kidId: "a1", rsvp: "no", out: false, back: false }]]);
    expect(err(applyAction(s, ctx(), seat("fama", "o1", "a1")[1], "fama", NOW))).toBe("invalid");
    expect(err(applyAction(s, ctx(), seat("fama", "o1", "a2")[1], "fama", NOW))).toBe("invalid");
    const noPlan = run([offerD()], baseEvent({ kidPlans: {} }));
    expect(err(applyAction(noPlan, ctx(), seat("famd", "o1", "c1")[1], "famd", NOW))).toBe("invalid");
  });

  test("already seated on this leg is seat_taken (same car or another)", () => {
    const s = run([offerA(), offerB(), seat("famc", "o1", "c1")]);
    expect(err(applyAction(s, ctx(), seat("famc", "o2", "c1")[1], "famc", NOW))).toBe("seat_taken");
    expect(err(applyAction(s, ctx(), seat("famc", "o1", "c1")[1], "famc", NOW))).toBe("seat_taken");
  });

  test("seated on the other leg doesn't block", () => {
    const s = run([offerA("out"), offerB("back"), seat("famc", "o1", "c1"), seat("famc", "o2", "c1")]);
    expect(s.offers.back[0]!.kidIds).toEqual(["c1"]);
  });

  test("full car is car_full", () => {
    const s = run([offerA("out", 1), seat("fama", "o1", "a1")]);
    expect(err(applyAction(s, ctx(), seat("famb", "o1", "b1")[1], "famb", NOW))).toBe("car_full");
  });

  test("unknown offer or kid is not_found", () => {
    expect(err(applyAction(baseEvent(), ctx(), seat("fama", "zz", "a1")[1], "fama", NOW))).toBe("not_found");
    expect(err(applyAction(run([offerA()]), ctx(), seat("fama", "o1", "zz")[1], "fama", NOW))).toBe("not_found");
  });
});

const offerD = (): [string, Action] => ["famd", { type: "offerCar", leg: "out", carId: "card", driverId: "p-famd", seats: 2, departAt: "09:00" }];

describe("unseatKid", () => {
  const s = run([offerA(), seat("famb", "o1", "b1")]);
  const unseat: Action = { type: "unseatKid", offerId: "o1", kidId: "b1" };

  test("kid's family and offer owner allowed; others forbidden", () => {
    expect(ok(applyAction(s, ctx(), unseat, "famb", NOW)).offers.out[0]!.kidIds).toEqual([]);
    expect(ok(applyAction(s, ctx(), unseat, "fama", NOW)).offers.out[0]!.kidIds).toEqual([]);
    expect(err(applyAction(s, ctx(), unseat, "famc", NOW))).toBe("forbidden");
  });

  test("kid not in that car is not_found", () => {
    expect(err(applyAction(s, ctx(), { type: "unseatKid", offerId: "o1", kidId: "a1" }, "fama", NOW))).toBe("not_found");
  });
});

describe("driver run", () => {
  const s = run([offerA(), seat("famb", "o1", "b1")]);

  test("startRun and setPicked are owner only", () => {
    expect(err(applyAction(s, ctx(), { type: "startRun", offerId: "o1" }, "famb", NOW))).toBe("forbidden");
    const started = ok(applyAction(s, ctx(), { type: "startRun", offerId: "o1" }, "fama", NOW));
    expect(started.offers.out[0]!.run).toEqual({ startedAt: NOW, picked: [] });
    expect(err(applyAction(started, ctx(), { type: "startRun", offerId: "o1" }, "fama", NOW))).toBe("invalid");
    const pick: Action = { type: "setPicked", offerId: "o1", kidId: "b1", picked: true };
    expect(err(applyAction(started, ctx(), pick, "famb", NOW))).toBe("forbidden");
    expect(ok(applyAction(started, ctx(), pick, "fama", NOW)).offers.out[0]!.run!.picked).toEqual(["b1"]);
  });

  test("setPicked needs a started run and a seated kid", () => {
    expect(err(applyAction(s, ctx(), { type: "setPicked", offerId: "o1", kidId: "b1", picked: true }, "fama", NOW))).toBe("invalid");
    const started = run([["fama", { type: "startRun", offerId: "o1" }]], s);
    expect(err(applyAction(started, ctx(), { type: "setPicked", offerId: "o1", kidId: "a1", picked: true }, "fama", NOW))).toBe("not_found");
  });

  test("unseating a picked kid removes them from picked", () => {
    const s2 = run([["fama", { type: "startRun", offerId: "o1" }], ["fama", { type: "setPicked", offerId: "o1", kidId: "b1", picked: true }], ["famb", { type: "unseatKid", offerId: "o1", kidId: "b1" }]], s);
    expect(s2.offers.out[0]!.run!.picked).toEqual([]);
  });
});

describe("setKidReady", () => {
  const s = run([offerA(), seat("famb", "o1", "b1")]);
  test("kid's family only", () => {
    const ready: Action = { type: "setKidReady", offerId: "o1", kidId: "b1", ready: true };
    expect(ok(applyAction(s, ctx(), ready, "famb", NOW)).offers.out[0]!.ready).toEqual(["b1"]);
    expect(err(applyAction(s, ctx(), ready, "fama", NOW))).toBe("forbidden");
  });
});

describe("setArrived", () => {
  const s = run([offerA(), seat("famb", "o1", "b1"), seat("famc", "o1", "c1")]);
  const started = run([["fama", { type: "startRun", offerId: "o1" }]], s);
  const arrive = (kidId: string, arrived = true): Action => ({ type: "setArrived", offerId: "o1", kidId, arrived });

  test("offer owner only; needs a started run and a seated kid", () => {
    expect(err(applyAction(s, ctx(), arrive("b1"), "fama", NOW))).toBe("invalid");
    expect(err(applyAction(started, ctx(), arrive("b1"), "famb", NOW))).toBe("forbidden");
    expect(err(applyAction(started, ctx(), arrive("a1"), "fama", NOW))).toBe("not_found");
    expect(err(applyAction(started, ctx(), { type: "setArrived", offerId: "zz", kidId: "b1", arrived: true }, "fama", NOW))).toBe("not_found");
    expect(err(applyAction(started, ctx(), { ...arrive("b1"), arrived: "yes" } as unknown as Action, "fama", NOW))).toBe("invalid");
    const after = ok(applyAction(started, ctx(), arrive("b1"), "fama", NOW));
    expect(after.offers.out[0]!.run).toEqual({ startedAt: NOW, picked: [], arrived: ["b1"] });
  });

  test("setting false clears it (and drops the empty list); repeating is a no-op", () => {
    const a = run([["fama", arrive("b1")], ["fama", arrive("b1")]], started);
    expect(a.offers.out[0]!.run!.arrived).toEqual(["b1"]);
    const cleared = run([["fama", arrive("b1", false)]], a);
    expect(cleared.offers.out[0]!.run).toEqual({ startedAt: NOW, picked: [] });
  });

  test("picking the kid clears arrived for that kid only", () => {
    const a = run([["fama", arrive("b1")], ["fama", arrive("c1")], ["fama", { type: "setPicked", offerId: "o1", kidId: "b1", picked: true }]], started);
    expect(a.offers.out[0]!.run).toEqual({ startedAt: NOW, picked: ["b1"], arrived: ["c1"] });
    expect(err(applyAction(a, ctx(), arrive("b1"), "fama", NOW))).toBe("invalid");
  });

  test("undo: setArrived and the pick that cleared it both round-trip", () => {
    const { after, entry } = logged(started, "fama", arrive("b1"));
    expect(body(ok(undo(after, ctx(), entry, "fama", NOW)))).toEqual(body(started));
    const arrived = run([["fama", arrive("b1")]], started);
    const pick = logged(arrived, "fama", { type: "setPicked", offerId: "o1", kidId: "b1", picked: true });
    expect(pick.after.offers.out[0]!.run!.arrived).toBeUndefined();
    expect(body(ok(undo(pick.after, ctx(), pick.entry, "fama", NOW)))).toEqual(body(arrived));
  });

  test("unseating an arrived kid is undone with the arrived flag", () => {
    const arrived = run([["fama", arrive("b1")]], started);
    const { after, entry } = logged(arrived, "famb", { type: "unseatKid", offerId: "o1", kidId: "b1" });
    expect(after.offers.out[0]!.run!.arrived).toBeUndefined();
    const restored = ok(undo(after, ctx(), entry, "famb", NOW)).offers.out[0]!;
    expect(restored.kidIds).toContain("b1");
    expect(restored.run!.arrived).toEqual(["b1"]);
  });

  test("setRun restores arrived (undo of removeOffer keeps it)", () => {
    const arrived = run([["fama", arrive("c1")]], started);
    const { after, entry } = logged(arrived, "fama", { type: "removeOffer", offerId: "o1" });
    expect(body(ok(undo(after, ctx(), entry, "fama", NOW)))).toEqual(body(arrived));
  });
});

describe("editEvent", () => {
  test("any family; validates fields; slug never changes", () => {
    const s = ok(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { title: "  New  title ", start: "11:00", date: "2026-10-21" } }, "famb", NOW));
    expect(s.title).toBe("New title");
    expect(s.start).toBe("11:00");
    expect(s.id).toBe("ev1");
    expect(err(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { title: "x" } }, "nobody", NOW))).toBe("forbidden");
    expect(err(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { date: "2026-02-30" } }, "fama", NOW))).toBe("invalid");
    expect(err(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { start: "25:00" } }, "fama", NOW))).toBe("invalid");
    // Nothing actually changed.
    expect(err(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { title: "Party", start: "10:00" } }, "fama", NOW))).toBe("invalid");
    expect(err(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { title: "" } }, "fama", NOW))).toBe("invalid");
    expect(err(applyAction(baseEvent(), ctx(), { type: "editEvent", patch: { hostFamilyId: "famb" } as never }, "fama", NOW))).toBe("invalid");
  });

  test("the log entry keeps only changed fields, with old values", () => {
    const a: Action = { type: "editEvent", patch: { title: "Party", start: "10:30", place: "Park" } };
    const r = applyAction(baseEvent(), ctx(), a, "famc", NOW);
    if (!r.ok) throw new Error(r.error);
    expect(loggedAction(a, r.inverse)).toEqual({ type: "editEvent", patch: { start: "10:30", place: "Park" }, prev: { start: "10:00", place: "Hall" } });
    // Other actions are logged as sent.
    const seatA: Action = { type: "seatKid", offerId: "o1", kidId: "a1" };
    expect(loggedAction(seatA, [])).toBe(seatA);
  });

  test("start/date flag out cars, returnTime/date flag back cars", () => {
    const before = run([offerA("out"), offerB("back")]);
    const start = ok(applyAction(before, ctx(), { type: "editEvent", patch: { start: "10:30" } }, "famc", NOW));
    expect(start.offers.out[0]!.departAtCheck).toBe(true);
    expect(start.offers.back[0]!.departAtCheck).toBeUndefined();
    const ret = ok(applyAction(before, ctx(), { type: "editEvent", patch: { returnTime: "14:00" } }, "famc", NOW));
    expect(ret.offers.out[0]!.departAtCheck).toBeUndefined();
    expect(ret.offers.back[0]!.departAtCheck).toBe(true);
    const date = ok(applyAction(before, ctx(), { type: "editEvent", patch: { date: "2026-10-22" } }, "famc", NOW));
    expect(date.offers.out[0]!.departAtCheck).toBe(true);
    expect(date.offers.back[0]!.departAtCheck).toBe(true);
    const title = ok(applyAction(before, ctx(), { type: "editEvent", patch: { title: "Renamed" } }, "famc", NOW));
    expect(title.offers.out[0]!.departAtCheck).toBeUndefined();
  });

  test("undo restores fields and flags", () => {
    const before = run([offerA("out"), offerB("back")]);
    const { after, entry } = logged(before, "famc", { type: "editEvent", patch: { date: "2026-10-22", start: "08:00" } });
    expect(body(ok(undo(after, ctx(), entry, "famc", NOW)))).toEqual(body(before));
  });
});

describe("departure check", () => {
  const flagged = () => run([offerA("out"), ["famc", { type: "editEvent", patch: { start: "10:30" } }]]);

  test("confirmDeparture: owner only, clears the flag, undoable", () => {
    const s = flagged();
    expect(err(applyAction(s, ctx(), { type: "confirmDeparture", offerId: "o1" }, "famb", NOW))).toBe("forbidden");
    const { after, entry } = logged(s, "fama", { type: "confirmDeparture", offerId: "o1" });
    expect(after.offers.out[0]!.departAtCheck).toBeUndefined();
    expect(err(applyAction(after, ctx(), { type: "confirmDeparture", offerId: "o1" }, "fama", NOW))).toBe("invalid");
    expect(body(ok(undo(after, ctx(), entry, "fama", NOW)))).toEqual(body(s));
  });

  test("updating departAt clears it (seats alone don't); undo brings it back", () => {
    const s = flagged();
    expect(ok(applyAction(s, ctx(), { type: "updateOffer", offerId: "o1", seats: 3 }, "fama", NOW)).offers.out[0]!.departAtCheck).toBe(true);
    const { after, entry } = logged(s, "fama", { type: "updateOffer", offerId: "o1", departAt: "09:50" });
    expect(after.offers.out[0]!.departAtCheck).toBeUndefined();
    expect(body(ok(undo(after, ctx(), entry, "fama", NOW)))).toEqual(body(s));
  });

  test("setDepartAtCheck is system-only", () => {
    expect(err(applyAction(flagged(), ctx(), { type: "setDepartAtCheck", offerId: "o1", check: false }, "fama", NOW))).toBe("forbidden");
  });
});

describe("cancel / restore", () => {
  test("any family; cancelling twice or restoring a live event is invalid; undoable", () => {
    const before = run([offerA()]);
    const { after, entry } = logged(before, "famd", { type: "cancelEvent" });
    expect(after.cancelled).toBe(true);
    expect(err(applyAction(after, ctx(), { type: "cancelEvent" }, "famb", NOW))).toBe("invalid");
    expect(err(applyAction(before, ctx(), { type: "restoreEvent" }, "famb", NOW))).toBe("invalid");
    expect(body(ok(undo(after, ctx(), entry, "famd", NOW)))).toEqual(body(before));
    const restored = ok(applyAction(after, ctx(), { type: "restoreEvent" }, "famb", NOW));
    expect(restored.cancelled).toBeUndefined();
    expect(body(restored)).toEqual(body(before));
  });

  test("every ride action is rejected while cancelled; editing still works", () => {
    const s = run([offerA("out"), seat("fama", "o1", "a1"), ["famc", { type: "editEvent", patch: { start: "10:30" } }], ["famb", { type: "cancelEvent" }]]);
    const blocked: [string, Action][] = [
      ["famb", { type: "setKidPlan", kidId: "b1", rsvp: "no", out: false, back: false }],
      ["famb", { type: "offerCar", leg: "out", carId: "carb", driverId: "p-famb", seats: 2, departAt: "09:00" }],
      ["fama", { type: "updateOffer", offerId: "o1", seats: 3 }],
      ["fama", { type: "removeOffer", offerId: "o1" }],
      ["famb", { type: "seatKid", offerId: "o1", kidId: "b1" }],
      ["fama", { type: "unseatKid", offerId: "o1", kidId: "a1" }],
      ["fama", { type: "startRun", offerId: "o1" }],
      ["fama", { type: "setKidReady", offerId: "o1", kidId: "a1", ready: true }],
      ["fama", { type: "confirmDeparture", offerId: "o1" }],
    ];
    for (const [actor, a] of blocked) expect(err(applyAction(s, ctx(), a, actor, NOW))).toBe("event_cancelled");
    expect(ok(applyAction(s, ctx(), { type: "editEvent", patch: { title: "Later" } }, "famb", NOW)).title).toBe("Later");
  });

  test("an earlier ride action can still be undone while cancelled", () => {
    const before = run([offerA()]);
    const { after, entry } = logged(before, "famb", { type: "seatKid", offerId: "o1", kidId: "b1" });
    const cancelled = run([["famc", { type: "cancelEvent" }]], after);
    expect(ok(undo(cancelled, ctx(), entry, "famb", NOW)).offers.out[0]!.kidIds).toEqual([]);
  });
});

describe("system actions", () => {
  test("rejected without the system flag", () => {
    const s = run([offerA()]);
    const sys: Action[] = [
      { type: "clearKidPlan", kidId: "a1" },
      { type: "restoreOffer", leg: "back", offer: { ...s.offers.out[0]!, id: "o7" } },
      { type: "setRun", offerId: "o1", run: { startedAt: 1, picked: [] } },
    ];
    for (const a of sys) expect(err(applyAction(s, ctx(), a, "fama", NOW))).toBe("forbidden");
  });
});

/* ---------- undo ---------- */

function logged(before: EventState, actor: string, action: Action, c: ActionCtx = ctx(), at = NOW): { after: EventState; entry: LogEntry } {
  const r = applyAction(before, c, action, actor, at);
  if (!r.ok) throw new Error(r.error);
  return { after: deepFreeze(r.state), entry: deepFreeze({ id: "log1", eventId: before.id, at, familyId: actor, action, inverse: r.inverse }) };
}

describe("undo", () => {
  test("only your own entry", () => {
    const { after, entry } = logged(baseEvent(), "fama", offerA()[1]);
    expect(err(undo(after, ctx(), entry, "famb", NOW))).toBe("forbidden");
  });

  test("expires after 2 minutes", () => {
    const { after, entry } = logged(baseEvent(), "fama", offerA()[1]);
    expect(undo(after, ctx(), entry, "fama", NOW + 120_000).ok).toBe(true);
    expect(err(undo(after, ctx(), entry, "fama", NOW + 120_001))).toBe("undo_expired");
  });

  test("an already-undone entry can't be undone again", () => {
    const { after, entry } = logged(baseEvent(), "fama", offerA()[1]);
    expect(err(undo(after, ctx(), { ...entry, undoneBy: "log2" }, "fama", NOW))).toBe("invalid");
  });

  test("seatKid ↔ unseatKid", () => {
    const before = run([offerA()]);
    const { after, entry } = logged(before, "famb", seat("famb", "o1", "b1")[1]);
    const r = undo(after, ctx(), entry, "famb", NOW + 1);
    expect(body(ok(r))).toEqual(body(before));
    expect(ok(r).version).toBe(after.version + 1);
  });

  test("offerCar ↔ removeOffer", () => {
    const before = baseEvent();
    const { after, entry } = logged(before, "fama", offerA()[1]);
    expect(body(ok(undo(after, ctx(), entry, "fama", NOW)))).toEqual(body(before));
  });

  test("removeOffer is restored with its kids and run (permission-safe via system flag)", () => {
    const before = run([offerB(), seat("fama", "o1", "a1"), seat("famc", "o1", "c1"), ["famb", { type: "startRun", offerId: "o1" }], ["famb", { type: "setPicked", offerId: "o1", kidId: "c1", picked: true }]]);
    const { after, entry } = logged(before, "famb", { type: "removeOffer", offerId: "o1" });
    expect(after.offers.out).toEqual([]);
    expect(body(ok(undo(after, ctx(), entry, "famb", NOW)))).toEqual(body(before));
  });

  test("removeOffer undo fails if a kid was seated elsewhere meanwhile", () => {
    const before = run([offerB(), offerA(), seat("famc", "o1", "c1")]);
    const { after, entry } = logged(before, "famb", { type: "removeOffer", offerId: "o1" });
    const moved = run([seat("famc", "o2", "c1")], after);
    expect(err(undo(moved, ctx(), entry, "famb", NOW))).toBe("seat_taken");
  });

  test("setKidPlan restores the plan and reseats with picked/ready flags", () => {
    const before = run([
      offerA("out"), offerA("back"),
      seat("famb", "o1", "b1"), seat("famb", "o2", "b1"),
      ["fama", { type: "startRun", offerId: "o1" }],
      ["fama", { type: "setPicked", offerId: "o1", kidId: "b1", picked: true }],
      ["famb", { type: "setKidReady", offerId: "o2", kidId: "b1", ready: true }],
    ]);
    const { after, entry } = logged(before, "famb", { type: "setKidPlan", kidId: "b1", rsvp: "no", out: false, back: false });
    expect(after.offers.out[0]!.kidIds).toEqual([]);
    expect(body(ok(undo(after, ctx(), entry, "famb", NOW)))).toEqual(body(before));
  });

  test("setKidPlan with no prior plan undoes to no plan", () => {
    const before = baseEvent({ kidPlans: {} });
    const { after, entry } = logged(before, "famc", { type: "setKidPlan", kidId: "c1", rsvp: "yes", out: true, back: false });
    expect(ok(undo(after, ctx(), entry, "famc", NOW)).kidPlans).toEqual({});
  });

  test("updateOffer, unseatKid, editEvent round-trip", () => {
    const before = run([offerA(), seat("famb", "o1", "b1")]);
    for (const [actor, a] of [
      ["fama", { type: "updateOffer", offerId: "o1", seats: 2, departAt: "08:15" }],
      ["fama", { type: "unseatKid", offerId: "o1", kidId: "b1" }],
      ["fama", { type: "editEvent", patch: { title: "Other", coverImageId: "img1" } }],
    ] as [string, Action][]) {
      const { after, entry } = logged(before, actor, a);
      expect(body(ok(undo(after, ctx(), entry, actor, NOW)))).toEqual(body(before));
    }
  });

  test("undoing an undo re-applies the action", () => {
    const before = run([offerA()]);
    const { after, entry } = logged(before, "famb", seat("famb", "o1", "b1")[1]);
    const r = undo(after, ctx(), entry, "famb", NOW);
    if (!r.ok) throw new Error(r.error);
    const undoEntry: LogEntry = { id: "log2", eventId: "ev1", at: NOW, familyId: "famb", action: { type: "undo", logId: "log1" }, inverse: r.inverse };
    expect(body(ok(undo(deepFreeze(r.state), ctx(), undoEntry, "famb", NOW)))).toEqual(body(after));
  });
});
