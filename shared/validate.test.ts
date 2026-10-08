import { describe, expect, test } from "bun:test";
import { buildFamily, createEventState, isDate, isJunkName, isTime, validateEventInput, validateFamilyInput } from "./validate.ts";

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

  test("rejects blank and stringified-missing names (family, parent, kid)", () => {
    for (const junk of ["   ", "undefined", " undefined ", "Undefined", "null", "NULL", undefined, null, 5]) {
      expect(validateFamilyInput({ ...input, name: junk }).ok).toBe(false);
      expect(validateFamilyInput({ ...input, parents: [{ name: junk, phone: "050-1234567" }] }).ok).toBe(false);
      expect(validateFamilyInput({ ...input, kids: [{ name: junk }] }).ok).toBe(false);
    }
  });

  test("city: trimmed and kept when given, omitted when blank, too long rejected", () => {
    const r = validateFamilyInput({ ...input, address: "הרצל 5", city: "  פרדס חנה-כרכור " });
    expect(r.ok && r.value.city).toBe("פרדס חנה-כרכור");
    for (const city of [undefined, "", "   "]) {
      const v = validateFamilyInput({ ...input, city });
      expect(v.ok).toBe(true);
      if (v.ok) expect("city" in v.value).toBe(false);
    }
    expect(validateFamilyInput({ ...input, city: "x".repeat(60) }).ok).toBe(true);
    expect(validateFamilyInput({ ...input, city: "x".repeat(61) }).ok).toBe(false);
    expect(validateFamilyInput({ ...input, city: 5 }).ok).toBe(false);
  });

  test("names that merely contain the words are fine", () => {
    expect(validateFamilyInput({ ...input, name: "Nullman" }).ok).toBe(true);
    expect(validateFamilyInput({ ...input, kids: [{ name: "undefined2" }] }).ok).toBe(true);
  });
});

describe("isJunkName", () => {
  test("missing, blank or a stringified missing value", () => {
    for (const v of [undefined, null, 0, "", "  ", "undefined", "null", " Null "]) expect(isJunkName(v)).toBe(true);
    for (const v of ["כהן", "Nullman", "undefined family"]) expect(isJunkName(v)).toBe(false);
  });
});

describe("buildFamily", () => {
  test("keeps ids of existing kids, mints new ones otherwise", () => {
    let n = 0;
    const gen = { id: () => `id${++n}` };
    const base = { id: "fam1", color: 2, createdAt: 5 };
    const v = validateFamilyInput(input);
    if (!v.ok) throw new Error();
    const first = buildFamily(v.value, base, null, gen);
    expect(first.kids.map((k) => k.id)).toEqual(["id1", "id2"]);
    const edited = buildFamily({ ...v.value, kids: [{ id: "id2", name: "Tali" }, { name: "New" }] }, base, first, gen);
    expect(edited.kids).toEqual([{ id: "id2", name: "Tali" }, { id: "id5", name: "New" }]);
    expect("keyHash" in edited).toBe(false);
  });

  test("people (drivers) keep their ids through an edit; unknown or repeated ids get fresh ones", () => {
    let n = 0;
    const gen = { id: () => `g${++n}` };
    const base = { id: "fam1", color: 0, createdAt: 0 };
    const v = validateFamilyInput({ ...input, parents: [{ name: "Dana", phone: "050-1234567" }, { name: "Avi", phone: "052-1234567" }] });
    if (!v.ok) throw new Error();
    const first = buildFamily(v.value, base, null, gen);
    const [dana, avi] = first.parents;
    expect(dana!.id).toBeTruthy();
    expect(avi!.id).not.toBe(dana!.id);
    // Round trip: Dana removed, Avi renamed, a new person added, a foreign id and a repeat ignored.
    const again = validateFamilyInput({
      ...input,
      parents: [
        { id: avi!.id, name: "Avi K", phone: "052-1234567" },
        { name: "Savta", phone: "053-1234567" },
        { id: "nope", name: "Nanny", phone: "054-1234567" },
        { id: avi!.id, name: "Twin", phone: "055-1234567" },
      ],
    });
    if (!again.ok) throw new Error();
    expect(again.value.parents[0]).toEqual({ id: avi!.id, name: "Avi K", phone: "+972521234567" });
    const edited = buildFamily(again.value, base, first, gen);
    expect(edited.parents[0]).toEqual({ id: avi!.id, name: "Avi K", phone: "+972521234567" });
    const ids = edited.parents.map((p) => p.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain("nope");
    expect(ids).not.toContain(dana!.id);
  });

  test("stores the city when given and drops it when cleared on edit", () => {
    const gen = { id: () => "x" };
    const base = { id: "fam1", color: 0, createdAt: 0 };
    const v = validateFamilyInput({ ...input, address: "הרצל 5", city: "כרכור" });
    if (!v.ok) throw new Error();
    const first = buildFamily(v.value, base, null, gen);
    expect(first.address).toBe("הרצל 5");
    expect(first.city).toBe("כרכור");
    const cleared = validateFamilyInput({ ...input, address: "הרצל 5", city: "" });
    if (!cleared.ok) throw new Error();
    expect("city" in buildFamily(cleared.value, base, first, gen)).toBe(false);
  });

  test("up to 6 people; ids must be short strings", () => {
    const person = (i: number) => ({ name: `P${i}`, phone: "050-1234567" });
    expect(validateFamilyInput({ ...input, parents: [1, 2, 3, 4, 5, 6].map(person) }).ok).toBe(true);
    expect(validateFamilyInput({ ...input, parents: [1, 2, 3, 4, 5, 6, 7].map(person) }).ok).toBe(false);
    expect(validateFamilyInput({ ...input, parents: [{ ...person(1), id: 5 }] }).ok).toBe(false);
    expect(validateFamilyInput({ ...input, parents: [{ ...person(1), id: "x".repeat(65) }] }).ok).toBe(false);
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
