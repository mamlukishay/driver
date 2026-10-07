import { parseInviteReply } from "../shared/inviteParse.ts";
import type { InviteParseResponse } from "../shared/types.ts";
import type { StoredImage } from "./images.ts";

export { parseInviteReply };

const MODEL = "claude-haiku-4-5-20251001";

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
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

export const DEFAULT_INVITE_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const SYSTEM_PROMPT = (today: string) =>
  "You read Hebrew event invitations (birthdays, bar/bat mitzvahs, school events). " +
  "Return ONLY JSON: {title, date (YYYY-MM-DD), times (array of HH:MM, chronological), place, address}. " +
  "Keep Hebrew text as written. Use null for unknown. " +
  `If the year is missing assume the next occurrence after today's date ${today} (Asia/Jerusalem).`;

const INVITE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    times: { type: ["array", "null"], items: { type: "string" } },
    place: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
  },
  required: ["title", "date", "times", "place", "address"],
};

/** Pulls the generated text (or already-parsed JSON object) out of the shapes Workers AI text models return. */
function aiReplyPayload(out: unknown): unknown {
  if (typeof out === "string") return out;
  if (typeof out !== "object" || out === null) return null;
  const o = out as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  return o.response ?? o.choices?.[0]?.message?.content ?? null;
}

/**
 * Reads an invitation image with Workers AI (free default). Never throws: an empty result means "fill it in by hand".
 * Vision input shape depends on the model family: Llama 3.2 vision takes a top-level `image` data URL, while
 * Llama 4 Scout / Mistral Small 3.1 take OpenAI-style `image_url` content parts in the user message.
 */
export async function parseInviteWithWorkersAI(
  ai: Ai,
  model: string,
  image: StoredImage,
  today: string,
): Promise<InviteParseResponse> {
  try {
    const dataUrl = `data:${image.mime};base64,${toBase64(image.bytes)}`;
    const instruction = "Read this invitation image and return the JSON.";
    const legacyVision = /llama-3\.2/.test(model);
    const messages = legacyVision
      ? [
          { role: "system", content: SYSTEM_PROMPT(today) },
          { role: "user", content: instruction },
        ]
      : [
          { role: "system", content: SYSTEM_PROMPT(today) },
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ];
    const input: Record<string, unknown> = { messages, max_tokens: 400, temperature: 0.1 };
    if (legacyVision) input.image = dataUrl;
    // JSON mode is documented for Llama 4 Scout; other models rely on the prompt plus defensive parsing.
    if (/llama-4/.test(model)) input.response_format = { type: "json_schema", json_schema: INVITE_JSON_SCHEMA };
    const out = await (ai as unknown as { run(m: string, i: unknown): Promise<unknown> }).run(model, input);
    return parseInviteReply(aiReplyPayload(out));
  } catch (e) {
    console.error("workers-ai invite parse failed", e instanceof Error ? e.message : String(e));
    return {};
  }
}
