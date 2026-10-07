import { cleanText, isDate, isTime } from "../shared/validate.ts";
import type { InviteParseResponse } from "../shared/types.ts";
import type { StoredImage } from "./images.ts";

const MODEL = "claude-haiku-4-5-20251001";

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Pulls the first JSON object out of a model reply and keeps only well-formed fields. */
export function parseInviteReply(text: string): InviteParseResponse {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: InviteParseResponse = {};
  const title = cleanText(r.title, 100);
  if (title) out.title = title;
  if (isDate(r.date)) out.date = r.date;
  if (Array.isArray(r.times)) {
    const times = r.times.filter(isTime).slice(0, 6);
    if (times.length) out.times = times;
  }
  const place = cleanText(r.place, 100);
  if (place) out.place = place;
  const address = cleanText(r.address, 200);
  if (address) out.address = address;
  return out;
}

/** Reads an invitation image with Claude vision. Never throws: an empty result means "fill it in by hand". */
export async function parseInvite(apiKey: string, image: StoredImage, today: string): Promise<InviteParseResponse> {
  const prompt =
    `זוהי הזמנה לאירוע ילדים בישראל (הטקסט בעברית). היום ${today}. ` +
    `חלץ את הפרטים והחזר אך ורק JSON תקין, בלי טקסט נוסף, במבנה: ` +
    `{"title": string, "date": "YYYY-MM-DD", "times": ["HH:MM"], "place": string, "address": string}. ` +
    `times הן כל השעות שמופיעות (התחלה, סיום), בפורמט 24 שעות. ` +
    `אם שנה חסרה, הנח את התאריך העתידי הקרוב ביותר. שדה לא ידוע - השמט אותו.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mime, data: toBase64(image.bytes) } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("anthropic", res.status, await res.text().catch(() => ""));
      return {};
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
    return parseInviteReply(text);
  } catch (e) {
    console.error("anthropic fetch failed", e);
    return {};
  }
}
