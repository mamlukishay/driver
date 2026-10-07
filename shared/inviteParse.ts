import type { InviteParseResponse } from "./types.ts";
import { cleanText, isDate, isTime } from "./validate.ts";

/** Finds the first balanced `{...}` in `text`, ignoring braces inside JSON strings. */
function firstObjectText(text: string): string | null {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function toRecord(input: unknown): Record<string, unknown> | null {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) return input as Record<string, unknown>;
  if (typeof input !== "string") return null;
  const unfenced = input.replace(/```[a-zA-Z]*/g, "");
  const candidate = firstObjectText(unfenced);
  if (!candidate) return null;
  try {
    const raw: unknown = JSON.parse(candidate);
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Turns a model reply (text, possibly fenced or surrounded by prose, or an already-parsed object)
 * into well-formed invitation fields. Anything malformed is dropped; total failure gives `{}`.
 */
export function parseInviteReply(input: unknown): InviteParseResponse {
  const r = toRecord(input);
  if (!r) return {};
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
