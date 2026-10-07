import type { InviteParseResponse } from "./types.ts";
import { replyObject } from "./aiReply.ts";
import { cleanText, isDate, isTime } from "./validate.ts";

/**
 * Turns a model reply (text, possibly fenced or surrounded by prose, or an already-parsed object)
 * into well-formed invitation fields. Anything malformed is dropped; total failure gives `{}`.
 */
export function parseInviteReply(input: unknown): InviteParseResponse {
  const r = replyObject(input);
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
