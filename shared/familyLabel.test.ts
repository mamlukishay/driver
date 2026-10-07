import { describe, expect, test } from "bun:test";
import { familyDisplayName, familyLabel, sameNameFamilies, streetOf, type LabelFamily } from "./familyLabel.ts";

const fam = (id: string, name: string, kids: string[], parent = "הורה", address = "", createdAt = 0): LabelFamily => ({
  id,
  name,
  kids: kids.map((n) => ({ name: n })),
  parents: [{ name: parent }],
  address,
  createdAt,
});

describe("familyLabel", () => {
  test("unique name → just the name", () => {
    const a = fam("a", "כהן", ["נועה"]);
    expect(familyLabel(a, [a, fam("b", "לוי", ["דני"])])).toEqual({ name: "כהן" });
  });

  test("colliding names → first two kids", () => {
    const a = fam("a", "כהן", ["נועה", "טל", "גיל"]);
    const b = fam("b", " כהן ", ["דני"]);
    expect(familyLabel(a, [a, b])).toEqual({ name: "כהן", extra: ["נועה", "טל"] });
    expect(familyLabel(b, [a, b])).toEqual({ name: " כהן ", extra: ["דני"] });
  });

  test("case-insensitive collision", () => {
    const a = fam("a", "Cohen", ["Noa"]);
    const b = fam("b", "cohen", ["Dan"]);
    expect(familyLabel(a, [a, b]).extra).toEqual(["Noa"]);
  });

  test("same kids or no kids → add a parent's first name", () => {
    const a = fam("a", "כהן", ["נועה"], "רונית כהן");
    const b = fam("b", "כהן", ["נועה"], "דוד");
    const c = fam("c", "כהן", [], "יעל");
    expect(familyLabel(a, [a, b, c])).toEqual({ name: "כהן", extra: ["נועה", "רונית"] });
    expect(familyLabel(c, [a, b, c])).toEqual({ name: "כהן", extra: ["יעל"] });
  });

  test("walks all four levels: kids → parent → street → ordinal", () => {
    const k1 = fam("k1", "כהן", ["נועה"], "רונית", "הרצל 1, חיפה", 1);
    const k2 = fam("k2", "כהן", ["דני"], "דוד", "הרצל 2, חיפה", 2);
    // Level 1: kids differ.
    expect(familyLabel(k1, [k1, k2])).toEqual({ name: "כהן", extra: ["נועה"] });
    // Level 2: same kid, different parent.
    const p2 = fam("p2", "כהן", ["נועה"], "דוד", "הרצל 3", 3);
    expect(familyLabel(k1, [k1, p2])).toEqual({ name: "כהן", extra: ["נועה", "רונית"] });
    // Level 3: same kid and parent first name, different street.
    const s2 = fam("s2", "כהן", ["נועה"], "רונית לוי", "ויצמן 5, חיפה", 4);
    expect(familyLabel(k1, [k1, s2])).toEqual({ name: "כהן", extra: ["נועה", "רונית", "הרצל"] });
    expect(familyLabel(s2, [k1, s2])).toEqual({ name: "כהן", extra: ["נועה", "רונית", "ויצמן"] });
    // Level 4: everything identical → ordinal by creation order (stable, independent of list order).
    const o2 = fam("o2", "כהן", ["נועה"], "רונית", "הרצל 9", 0);
    expect(familyLabel(k1, [k1, o2])).toEqual({ name: "כהן", ordinal: 2 });
    expect(familyLabel(o2, [k1, o2])).toEqual({ name: "כהן", ordinal: 1 });
    expect(familyLabel(o2, [o2, k1])).toEqual({ name: "כהן", ordinal: 1 });
  });

  test("streetOf", () => {
    expect(streetOf("רחוב הרצל 12, חיפה")).toBe("רחוב הרצל");
    expect(streetOf("Main St, Haifa")).toBe("Main St");
    expect(streetOf("")).toBe("");
  });

  test("sameNameFamilies", () => {
    const all = [fam("a", "כהן", []), fam("b", "לוי", []), fam("c", "Cohen", [])];
    expect(sameNameFamilies("  כהן ", all).map((f) => f.id)).toEqual(["a"]);
    expect(sameNameFamilies("COHEN", all).map((f) => f.id)).toEqual(["c"]);
    expect(sameNameFamilies(" ", all)).toEqual([]);
  });
});

describe("missing family names (legacy or corrupt data)", () => {
  const missing = (id: string, name: unknown, parent = "רונית כהן", kids: string[] = []) => fam(id, name as string, kids, parent);

  test("blank, missing, \"undefined\" or \"null\" → first parent's first name", () => {
    for (const name of [undefined, null, "", "  ", "undefined", "null", " Undefined "]) {
      expect(familyDisplayName(missing("a", name))).toBe("רונית");
      expect(familyLabel(missing("a", name), [missing("a", name)])).toEqual({ name: "רונית" });
    }
  });

  test("no usable parent name either → \"?\"", () => {
    expect(familyDisplayName({ name: "undefined", parents: [] })).toBe("?");
    expect(familyDisplayName({ name: "", parents: [{ name: "undefined" }] })).toBe("?");
    expect(familyLabel(missing("a", undefined, " "), [])).toEqual({ name: "?" });
  });

  test("a real name is kept as stored", () => {
    expect(familyDisplayName({ name: " כהן ", parents: [] })).toBe(" כהן ");
  });

  test("other families' missing names don't throw and don't collide with real ones", () => {
    const a = fam("a", "כהן", ["נועה"]);
    const b = missing("b", undefined, "דנה", ["undefined", "טל"]);
    expect(familyLabel(a, [a, b])).toEqual({ name: "כהן" });
    expect(familyLabel(b, [a, b])).toEqual({ name: "דנה" });
    // Two nameless families: told apart by kids, ignoring junk kid names.
    const c = missing("c", "null", "דנה", ["גיל"]);
    expect(familyLabel(b, [a, b, c])).toEqual({ name: "דנה", extra: ["טל"] });
    expect(familyLabel(c, [a, b, c])).toEqual({ name: "דנה", extra: ["גיל"] });
  });
});
