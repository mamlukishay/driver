import { describe, expect, test } from "bun:test";
import { fullAddress } from "./address.ts";

describe("fullAddress", () => {
  test("street and city", () => {
    expect(fullAddress({ address: "הרצל 5", city: "פרדס חנה-כרכור" })).toBe("הרצל 5, פרדס חנה-כרכור");
  });
  test("only one part", () => {
    expect(fullAddress({ address: "הרצל 5" })).toBe("הרצל 5");
    expect(fullAddress({ address: "הרצל 5", city: "" })).toBe("הרצל 5");
    expect(fullAddress({ address: "", city: "כרכור" })).toBe("כרכור");
    expect(fullAddress({ city: "כרכור" })).toBe("כרכור");
  });
  test("neither", () => {
    expect(fullAddress({})).toBe("");
    expect(fullAddress({ address: "  ", city: " " })).toBe("");
  });
  test("trims", () => {
    expect(fullAddress({ address: " הרצל 5 ", city: " כרכור " })).toBe("הרצל 5, כרכור");
  });
  test("legacy street text that already names the city stays unchanged", () => {
    expect(fullAddress({ address: "הרצל 5, פרדס חנה", city: "פרדס חנה" })).toBe("הרצל 5, פרדס חנה");
  });
});
