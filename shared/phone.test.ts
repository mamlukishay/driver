import { describe, expect, test } from "bun:test";
import { formatPhoneLocal, normalizePhone, telHref, waNumber } from "./phone.ts";
import { waChooserUrl, waPersonUrl } from "./whatsapp.ts";

describe("normalizePhone", () => {
  const good = ["050-1234567", "0501234567", "+972501234567", "972-50-123-4567", "050 123 4567", "(050) 123-4567", "+972 50-123-4567", "+972-050-1234567", "00972501234567", " 0501234567 "];
  for (const input of good) test(`accepts ${JSON.stringify(input)}`, () => expect(normalizePhone(input)).toBe("+972501234567"));

  const bad = ["", "abc", "02-1234567", "050123456", "05012345678", "+1 650 123 4567", "+0501234567", "501234567", "972-2-1234567", "050-123-456a", "+97250123456"];
  for (const input of bad) test(`rejects ${JSON.stringify(input)}`, () => expect(normalizePhone(input)).toBeNull());

  test("helpers", () => {
    expect(waNumber("054-765-4321")).toBe("972547654321");
    expect(formatPhoneLocal("+972547654321")).toBe("054-765-4321");
    expect(telHref("0547654321")).toBe("tel:+972547654321");
    expect(waNumber("nope")).toBeNull();
  });
});

describe("whatsapp", () => {
  test("person url encodes text and uses 972 form", () => {
    expect(waPersonUrl("050-1234567", "יצאתי, אגיע בעוד ~10 דק׳ & bye")).toBe(
      `https://wa.me/972501234567?text=${encodeURIComponent("יצאתי, אגיע בעוד ~10 דק׳ & bye")}`,
    );
    expect(waPersonUrl("123", "x")).toBeNull();
  });
  test("chooser url", () => {
    expect(waChooserUrl("a b")).toBe("https://wa.me/?text=a%20b");
  });
});
