import { describe, expect, test } from "bun:test";
import { byLastUsed, nextEventDate, prefillFrom } from "./myGroups.ts";

describe("byLastUsed", () => {
  test("most recent first, unknown last in original order", () => {
    expect(byLastUsed(["a", "b", "c", "d"], { c: 5, a: 9 })).toEqual(["a", "c", "b", "d"]);
  });
  test("no timestamps keeps order", () => {
    expect(byLastUsed(["x", "y"], {})).toEqual(["x", "y"]);
  });
});

describe("nextEventDate", () => {
  test("earliest upcoming, skipping past and cancelled", () => {
    const evs = [
      { date: "2026-10-01" },
      { date: "2026-10-20" },
      { date: "2026-10-09", cancelled: true as const },
      { date: "2026-10-12" },
    ];
    expect(nextEventDate(evs, "2026-10-07")).toBe("2026-10-12");
  });
  test("today counts; none → null", () => {
    expect(nextEventDate([{ date: "2026-10-07" }], "2026-10-07")).toBe("2026-10-07");
    expect(nextEventDate([{ date: "2026-10-06" }], "2026-10-07")).toBeNull();
  });
});

describe("prefillFrom", () => {
  test("copies details without ids, photos or kids; kids become choices", () => {
    const p = prefillFrom({
      name: "כהן",
      address: "הרצל 1",
      parents: [{ name: "רונית", phone: "+972521111111" }],
      kids: [
        { id: "k1", name: "נועה", phone: "+972501234567" },
        { id: "k2", name: "איתי" },
      ],
      cars: [{ id: "c1", label: "מאזדה", seats: 3, color: "אדום", plate: "123", photoId: "img1" }],
    });
    expect(p.family).toEqual({
      name: "כהן",
      address: "הרצל 1",
      parents: [{ name: "רונית", phone: "+972521111111" }],
      kids: [],
      cars: [{ label: "מאזדה", seats: 3, color: "אדום", plate: "123" }],
    });
    expect(p.kids).toEqual([{ name: "נועה", phone: "+972501234567" }, { name: "איתי" }]);
  });
});
