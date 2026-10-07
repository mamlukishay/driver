import { describe, expect, test } from "bun:test";
import { buildFamily, createEventState, isDate, isTime, validateEventInput, validateFamilyInput } from "./validate.ts";

const input = {
  name: " Cohen ",
  parents: [{ name: "Dana", phone: "050-1234567" }],
  address: "Herzl 1, Haifa",
  kids: [{ name: "Noa", phone: "" }, { name: "Tal", phone: "054 765 4321" }],
  cars: [{ label: "Mazda", seats: 4, plate: "123", color: "" }],
};

describe("validateFamilyInput", () => {
  test("normalizes phones and trims", () => {
    const r = validateFamilyInput(input);
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Cohen",
        parents: [{ name: "Dana", phone: "+972501234567" }],
        address: "Herzl 1, Haifa",
        kids: [{ name: "Noa" }, { name: "Tal", phone: "+972547654321" }],
        cars: [{ label: "Mazda", seats: 4, plate: "123" }],
      },
    });
  });

  test("rejects bad input", () => {
    const bads: unknown[] = [
      null,
      { ...input, name: "" },
      { ...input, parents: [] },
      { ...input, parents: [{ name: "Dana", phone: "02-1234567" }] },
      { ...input, kids: [{ name: "Noa", phone: "123" }] },
      { ...input, cars: [{ label: "x", seats: 0 }] },
      { ...input, cars: [{ label: "x", seats: 13 }] },
    ];
    for (const b of bads) expect(validateFamilyInput(b).ok).toBe(false);
  });
});

describe("buildFamily", () => {
  test("keeps ids and kid tokens of existing kids, mints new ones otherwise", () => {
    let n = 0;
    const gen = { id: () => `id${++n}`, kidToken: () => `tok${n}` };
    const base = { id: "fam1", color: 2, keyHash: "h", createdAt: 5 };
    const v = validateFamilyInput(input);
    if (!v.ok) throw new Error();
    const first = buildFamily(v.value, base, null, gen);
    expect(first.kids.map((k) => [k.id, k.kidToken])).toEqual([["id1", "tok1"], ["id2", "tok2"]]);
    const edited = buildFamily({ ...v.value, kids: [{ id: "id2", name: "Tali" }, { name: "New" }] }, base, first, gen);
    expect(edited.kids).toEqual([{ id: "id2", name: "Tali", kidToken: "tok2" }, { id: "id4", name: "New", kidToken: "tok4" }]);
    expect(edited.keyHash).toBe("h");
  });
});

describe("events", () => {
  test("date/time validators", () => {
    expect(isDate("2026-02-28")).toBe(true);
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2026-2-1")).toBe(false);
    expect(isTime("00:00")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
  });

  test("validateEventInput + createEventState", () => {
    const r = validateEventInput({ title: "Bar mitzvah", date: "2026-11-01", start: "10:30", returnTime: "14:00", place: "Hall", address: "", coverImageId: "img" });
    if (!r.ok) throw new Error();
    const s = createEventState(r.value, { id: "ev", hostFamilyId: "fam1", now: 9 });
    expect(s).toMatchObject({ id: "ev", version: 1, kidPlans: {}, offers: { out: [], back: [] }, coverImageId: "img" });
    expect(validateEventInput({ title: "x", date: "2026-11-01", start: "1030", returnTime: "14:00" }).ok).toBe(false);
  });
});
