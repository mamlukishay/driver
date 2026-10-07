import { describe, expect, test } from "bun:test";
import { normalizeWaGroupUrl } from "./whatsapp.ts";

describe("normalizeWaGroupUrl", () => {
  const code = "AbCdEf1234567890XyZ";
  test("accepts the invite link and normalizes it", () => {
    expect(normalizeWaGroupUrl(`https://chat.whatsapp.com/${code}`)).toBe(`https://chat.whatsapp.com/${code}`);
    expect(normalizeWaGroupUrl(`  chat.whatsapp.com/${code}  `)).toBe(`https://chat.whatsapp.com/${code}`);
    expect(normalizeWaGroupUrl(`http://chat.whatsapp.com/${code}/`)).toBe(`https://chat.whatsapp.com/${code}`);
    expect(normalizeWaGroupUrl(`https://chat.whatsapp.com/${code}?mode=ems_copy_t`)).toBe(`https://chat.whatsapp.com/${code}`);
  });
  test("empty clears", () => {
    expect(normalizeWaGroupUrl("")).toBe("");
    expect(normalizeWaGroupUrl("   ")).toBe("");
  });
  test("rejects anything else", () => {
    for (const bad of [
      "https://chat.whatsapp.com/short",
      `https://chat.whatsapp.com/${"a".repeat(41)}`,
      `https://wa.me/${code}`,
      `https://evil.com/chat.whatsapp.com/${code}`,
      `https://chat.whatsapp.com.evil.com/${code}`,
      `https://chat.whatsapp.com/${code}-x`,
      `javascript:chat.whatsapp.com/${code}`,
    ])
      expect(normalizeWaGroupUrl(bad), bad).toBeNull();
  });
});
