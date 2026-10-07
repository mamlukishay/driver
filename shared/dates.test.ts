import { describe, expect, test } from "bun:test";
import { addDays, dateInZone, fmtDmy, shownOnGroupHome } from "./dates.ts";

describe("dates", () => {
  test("dateInZone uses Israel's calendar date", () => {
    // 2026-10-07 22:30 UTC is already Oct 8 in Israel (UTC+3 in October).
    expect(dateInZone(Date.UTC(2026, 9, 7, 22, 30))).toBe("2026-10-08");
    expect(dateInZone(Date.UTC(2026, 9, 7, 20, 30))).toBe("2026-10-07");
  });

  test("addDays crosses months and years", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-07", -30)).toBe("2026-09-07");
  });

  test("past events show for 30 days after their date", () => {
    const today = "2026-10-07";
    expect(shownOnGroupHome("2026-10-20", today)).toBe(true);
    expect(shownOnGroupHome("2026-10-07", today)).toBe(true);
    expect(shownOnGroupHome("2026-09-07", today)).toBe(true);
    expect(shownOnGroupHome("2026-09-06", today)).toBe(false);
  });

  test("fmtDmy shows dd/mm/yyyy, empty for empty or malformed input", () => {
    expect(fmtDmy("2026-10-07")).toBe("07/10/2026");
    expect(fmtDmy("2027-01-31")).toBe("31/01/2027");
    expect(fmtDmy("")).toBe("");
    expect(fmtDmy("2026-1-7")).toBe("");
    expect(fmtDmy("garbage")).toBe("");
  });
});
