import { describe, expect, test } from "bun:test";
import { gapsFor, legGap, waitingKids } from "./gaps.ts";
import type { EventState, Offer } from "./types.ts";
import { baseEvent } from "./test/fixtures.ts";

const offer = (id: string, seats: number, kidIds: string[]): Offer => ({ id, familyId: id, carId: id, seats, departAt: "09:00", kidIds });

describe("gaps", () => {
  test("no offers: everything missing", () => {
    // need out: a1 a2 b1 c1 = 4; back: a1 b1 c1 = 3
    expect(gapsFor(baseEvent())).toEqual({
      out: { need: 4, seats: 0, seated: 0, waiting: 4, missing: 4, state: "missing" },
      back: { need: 3, seats: 0, seated: 0, waiting: 3, missing: 3, state: "missing" },
    });
  });

  test("enough seats but unseated kids → unassigned", () => {
    const s = baseEvent({ offers: { out: [offer("x", 3, ["a1"]), offer("y", 2, [])], back: [] } });
    expect(legGap(s, "out")).toEqual({ need: 4, seats: 5, seated: 1, waiting: 3, missing: 0, state: "unassigned" });
    expect(waitingKids(s, "out")).toEqual(["a2", "b1", "c1"]);
  });

  test("everyone seated → ok, extra empty seats are fine", () => {
    const s = baseEvent({ offers: { out: [], back: [offer("x", 4, ["a1", "b1", "c1"])] } });
    expect(legGap(s, "back")).toEqual({ need: 3, seats: 4, seated: 3, waiting: 0, missing: 0, state: "ok" });
  });

  test("partial seats → missing counts need minus seats", () => {
    const s = baseEvent({ offers: { out: [offer("x", 1, ["c1"])], back: [] } });
    expect(legGap(s, "out")).toMatchObject({ missing: 3, waiting: 3, state: "missing" });
  });

  test("rsvp no and legs off don't count; no kids → ok", () => {
    const s: EventState = baseEvent({ kidPlans: { a1: { rsvp: "no", out: false, back: false }, b1: { rsvp: "yes", out: false, back: true } } });
    expect(legGap(s, "out")).toEqual({ need: 0, seats: 0, seated: 0, waiting: 0, missing: 0, state: "ok" });
    expect(legGap(s, "back").need).toBe(1);
  });
});
