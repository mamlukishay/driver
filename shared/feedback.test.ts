import { describe, expect, test } from "bun:test";
import {
  baseMime,
  cleanContext,
  FEEDBACK_MAX_RECORD_SECONDS,
  FEEDBACK_MAX_TEXT,
  feedbackRecordKey,
  isFeedbackAudioMime,
  isFeedbackScreenshotMime,
  issueBody,
  issueLabels,
  issueTitle,
  stripControl,
  validateFeedback,
} from "./feedback.ts";

describe("validateFeedback", () => {
  test("accepts text feedback and strips control chars", () => {
    const r = validateFeedback({ kind: "improve", text: " שלום\u0007\r\nעולם‮ ", context: { path: "/g/x" } });
    expect(r).toEqual({ ok: true, value: { kind: "improve", text: "שלום\nעולם", context: { path: "/g/x" } } });
  });

  test("accepts audio-only feedback", () => {
    const r = validateFeedback({ kind: "keep", text: "", audioId: "abcd2345efgh", transcript: "היי", context: {} });
    expect(r.ok && r.value).toEqual({ kind: "keep", text: "", audioId: "abcd2345efgh", transcript: "היי", context: {} });
  });

  test("keeps a screenshot id", () => {
    const r = validateFeedback({ kind: "keep", text: "x", screenshotId: "abcd2345efgh" });
    expect(r.ok && r.value.screenshotId).toBe("abcd2345efgh");
  });

  test("rejects bad input", () => {
    const bads: unknown[] = [
      null,
      [],
      { kind: "other", text: "x" },
      { kind: "improve" },
      { kind: "improve", text: "" },
      { kind: "improve", text: "   \u0001 " },
      { kind: "improve", text: "x".repeat(FEEDBACK_MAX_TEXT + 1) },
      { kind: "improve", text: "x", audioId: "../../etc" },
      { kind: "improve", text: "x", screenshotId: "A B" },
      { kind: "improve", text: "x", audioId: 5 },
    ];
    for (const b of bads) expect(validateFeedback(b).ok).toBe(false);
  });

  test("audioSeconds: kept with audio, clamped, dropped otherwise", () => {
    const a = { kind: "keep", text: "", audioId: "abcd2345efgh" };
    const secs = (b: object) => {
      const r = validateFeedback(b);
      return r.ok ? r.value.audioSeconds : "invalid";
    };
    expect(secs({ ...a, audioSeconds: 42 })).toBe(42);
    expect(secs({ ...a, audioSeconds: 0 })).toBe(0);
    expect(secs({ ...a, audioSeconds: 9999 })).toBe(FEEDBACK_MAX_RECORD_SECONDS + 5);
    expect(secs({ ...a, audioSeconds: -3 })).toBe(0);
    expect(secs({ ...a, audioSeconds: 7.6 })).toBe(8);
    expect(secs({ ...a, audioSeconds: "12" })).toBeUndefined();
    expect(secs({ ...a, audioSeconds: Number.NaN })).toBeUndefined();
    expect(secs({ kind: "keep", text: "x", audioSeconds: 12 })).toBeUndefined();
  });

  test("text at the limit is fine", () => {
    expect(validateFeedback({ kind: "improve", text: "א".repeat(FEEDBACK_MAX_TEXT) }).ok).toBe(true);
  });
});

describe("cleanContext", () => {
  test("keeps known fields, truncates, drops junk", () => {
    const c = cleanContext({
      path: "/g/abc",
      kidPage: true,
      userAgent: "U".repeat(1000),
      screenshot: "failed",
      evil: "x",
      familyName: { toString: () => "x" },
      viewport: "390×844\n",
    });
    expect(c.path).toBe("/g/abc");
    expect(c.kidPage).toBe(true);
    expect(c.userAgent!.length).toBe(400);
    expect(c.screenshot).toBe("failed");
    expect(c.viewport).toBe("390×844");
    expect("evil" in c).toBe(false);
    expect("familyName" in c).toBe(false);
  });
  test("bad screenshot state and non-objects", () => {
    expect(cleanContext({ screenshot: "maybe" })).toEqual({});
    expect(cleanContext("x")).toEqual({});
  });
});

describe("mime helpers", () => {
  test("audio", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(isFeedbackAudioMime("audio/webm;codecs=opus")).toBe(true);
    expect(isFeedbackAudioMime("audio/mp4")).toBe(true);
    expect(isFeedbackAudioMime("audio/ogg; codecs=opus")).toBe(true);
    expect(isFeedbackAudioMime("video/mp4")).toBe(false);
    expect(isFeedbackAudioMime(null)).toBe(false);
  });
  test("screenshot", () => {
    expect(isFeedbackScreenshotMime("image/jpeg")).toBe(true);
    expect(isFeedbackScreenshotMime("image/svg+xml")).toBe(false);
  });
});

describe("issue rendering", () => {
  test("title uses the first 60 chars", () => {
    expect(issueTitle({ kind: "improve", text: "קצר" })).toBe("[לשיפור] קצר");
    const long = "א".repeat(80);
    expect(issueTitle({ kind: "keep", text: long })).toBe(`[לשימור] ${"א".repeat(60)}…`);
    expect(issueTitle({ kind: "improve", text: "" })).toBe("[לשיפור] הקלטה קולית");
    expect(issueTitle({ kind: "improve", text: "a\n\nb" })).toBe("[לשיפור] a b");
  });

  test("title falls back to the transcript, then to the voice label", () => {
    expect(issueTitle({ kind: "improve", text: "", transcript: "הכפתור\nקטן" })).toBe("[לשיפור] הכפתור קטן");
    expect(issueTitle({ kind: "keep", text: "", transcript: "ב".repeat(70) })).toBe(`[לשימור] ${"ב".repeat(60)}…`);
    expect(issueTitle({ kind: "keep", text: "טקסט", transcript: "תמלול" })).toBe("[לשימור] טקסט");
    expect(issueTitle({ kind: "keep", text: "", transcript: "" })).toBe("[לשימור] הקלטה קולית");
  });

  test("labels", () => {
    expect(issueLabels("keep")).toEqual(["feedback", "keep"]);
  });

  const audioLinks = {
    audioUrl: "https://ex.com/api/feedback/audio/a1",
    audioCardUrl: "https://ex.com/api/feedback/audio/a1/card.svg?s=5",
    audioPlayerUrl: "https://ex.com/api/feedback/audio/a1/play",
  };

  test("body has text, transcript, player card, screenshot and a context table", () => {
    const body = issueBody(
      {
        id: "abc23456",
        kind: "improve",
        text: "# not a heading\n<script>",
        transcript: "תמלול </div><b>x",
        context: { path: "/g/x|y", kidPage: false, familyName: "כהן", screenshot: "attached" },
      },
      { ...audioLinks, screenshotUrl: "https://ex.com/api/feedback/screenshot/s1" },
    );
    expect(body).toContain('<div dir="rtl">\n\n> # not a heading\n> &lt;script>\n\n</div>');
    expect(body).toContain('### 🎙️ Voice recording (transcript)\n\n<div dir="rtl">\n\n> תמלול &lt;/div>&lt;b>x\n\n</div>');
    expect(body).toContain(
      "[![▶ Play recording](https://ex.com/api/feedback/audio/a1/card.svg?s=5)](https://ex.com/api/feedback/audio/a1/play)\n" +
        "<sub>[download](https://ex.com/api/feedback/audio/a1)</sub>",
    );
    // Voice section (heading, transcript, card) sits together, before the screenshot.
    expect(body.indexOf("Voice recording")).toBeLessThan(body.indexOf("Play recording"));
    expect(body.indexOf("Play recording")).toBeLessThan(body.indexOf("### Screenshot"));
    // User text can't close the rtl div: only our own closing tags appear.
    expect(body.match(/<\/div>/g)!.length).toBe(2);
    expect(body).not.toContain("_(no text)_");
    expect(body).toContain("![screenshot](https://ex.com/api/feedback/screenshot/s1)");
    expect(body).toContain("| Route | /g/x\\|y |");
    expect(body).toContain("| Kid page | no |");
    expect(body).toContain("| Family | כהן |");
    expect(body).toContain("| Feedback id | abc23456 |");
  });

  test("voice only: no '(no text)' line, transcript shown", () => {
    const body = issueBody({ id: "abc23456", kind: "keep", text: "", transcript: "היי", context: {} }, audioLinks);
    expect(body).not.toContain("_(no text)_");
    expect(body).toContain("> היי");
    expect(body).toContain("(https://ex.com/api/feedback/audio/a1/play)");
  });

  test("audio without a transcript still gets the heading and the card", () => {
    const body = issueBody({ id: "abc23456", kind: "keep", text: "", context: {} }, audioLinks);
    expect(body).toContain("### 🎙️ Voice recording (transcript)\n\n_(transcription unavailable)_");
    expect(body).toContain("card.svg?s=5");
    expect(body).not.toContain("_(no text)_");
  });

  test("text only: no voice section", () => {
    const body = issueBody({ id: "abc23456", kind: "keep", text: "שלום", context: {} });
    expect(body).toContain('<div dir="rtl">\n\n> שלום\n\n</div>');
    expect(body).not.toContain("Voice recording");
    expect(body).not.toContain("Play recording");
    expect(body).not.toContain("_(no text)_");
  });

  test("body without optional parts", () => {
    const body = issueBody({ id: "abc23456", kind: "keep", text: "", context: {} });
    expect(body).toContain("_(no text)_");
    expect(body).not.toContain("Voice recording");
    expect(body).not.toContain("![screenshot]");
  });

  test("record key", () => {
    expect(feedbackRecordKey("abc", new Date("2026-10-07T23:00:00Z"))).toBe("feedback/2026-10-07/abc.json");
  });

  test("stripControl keeps tabs and newlines", () => {
    expect(stripControl("a\tb\nc\u0000")).toBe("a\tb\nc");
  });
});
