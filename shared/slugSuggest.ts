/**
 * English URL-name suggestions for (usually Hebrew) names, via an LLM: a group's URL name, the word in an
 * event slug, a kid's link name. Pure parts; the Worker wires the AI binding.
 */
import { aiReplyPayload, replyObject } from "./aiReply.ts";
import { firstFreeSlugAsync, isKidSlug, isSlug, slugify } from "./slug.ts";

/** What is being named: a group (`/g/<slug>`), an event (`/e/<mon>-<day>-<word>`) or a kid (`/kid/<slug>`). */
export type SlugKind = "group" | "event" | "kid";

/** Anything with Workers AI's `run(model, input)` shape (the `Ai` binding, or a test double). */
export interface AiRunner {
  run(model: string, input: unknown): Promise<unknown>;
}

/** Longest suggestion we keep (leaves room for a `-2` suffix within SLUG_MAX). */
export const SUGGESTED_SLUG_MAX = 30;
/** The event word: what `eventSlugBase` keeps (`slugify(word, 20)`). */
export const SUGGESTED_EVENT_WORD_MAX = 20;
/** A kid's link name (KID_SLUG_MAX 30 leaves room for `-2`). */
export const SUGGESTED_KID_SLUG_MAX = 24;

export const SLUG_SUGGEST_PROMPT =
  "You name carpool groups of parents (a school class, a kindergarten, a sports team, a birthday or bar mitzvah, a trip). " +
  "Given the group's name (usually Hebrew), return ONLY JSON: {\"slug\": \"...\"}. " +
  "The slug is 1-4 short lowercase English words joined by hyphens, at most 30 characters, only a-z, 0-9 and hyphens. " +
  "Transliterate people's and place names to their common English spelling (תומר→tomer, גבעתיים→givatayim, רעננה→raanana). " +
  "Translate common words (כיתה→class, גן→kindergarten, בר מצווה→bar-mitzvah, בת מצווה→bat-mitzvah, יום הולדת→birthday, כדורגל→soccer, חוג→club). " +
  "Hebrew letters used as numbers become digits (א=1, ב=2, ג=3, ד=4, ה=5, ו=6). Keep digits. " +
  'Examples: "בר מצווה לתומר" → {"slug": "tomer-bar-mitzvah"}; "כיתה ד׳2 גבעתיים" → {"slug": "class-4-2-givatayim"}; ' +
  '"גן חבצלת" → {"slug": "kindergarten-havatzelet"}.';

export const EVENT_SLUG_SUGGEST_PROMPT =
  "You name events in a parents' carpool app (a birthday, a bar or bat mitzvah, a class trip, a game, a show). " +
  "Given the event's title (usually Hebrew), return ONLY JSON: {\"slug\": \"...\"}. " +
  "The slug is 1-3 short lowercase English words joined by hyphens, at most 20 characters, only a-z, 0-9 and hyphens. " +
  "Leave out dates, times and filler words (the link already has the date). " +
  "Transliterate people's and place names to their common English spelling (תמיר→tamir, תומר→tomer, רעננה→raanana). " +
  "Translate common words (בר מצווה→bar-mitzvah, בת מצווה→bat-mitzvah, יום הולדת→birthday, טיול→trip, הופעה→show, משחק→game). " +
  'Examples: "בר המצווה של תמיר" → {"slug": "tamir-bar-mitzvah"}; "יום הולדת 12 לתמר" → {"slug": "tamar-birthday"}; ' +
  '"טיול שנתי לגליל" → {"slug": "galilee-trip"}.';

export const KID_SLUG_SUGGEST_PROMPT =
  "You write a child's first name in English letters for a personal link in a parents' carpool app. " +
  "Given the child's name (usually Hebrew), return ONLY JSON: {\"slug\": \"...\"}. " +
  "The slug is the first name only (drop any family name), transliterated to its most common English spelling, " +
  "lowercase, only a-z, at most 20 characters. " +
  'Examples: "נועה" → {"slug": "noa"}; "תמיר" → {"slug": "tamir"}; "יונתן כהן" → {"slug": "yonatan"}; ' +
  '"אביגיל" → {"slug": "avigail"}; "שירה" → {"slug": "shira"}.';

interface KindRule {
  prompt: string;
  max: number;
  valid: (s: string) => boolean;
}

const KINDS: Record<SlugKind, KindRule> = {
  group: { prompt: SLUG_SUGGEST_PROMPT, max: SUGGESTED_SLUG_MAX, valid: isSlug },
  event: { prompt: EVENT_SLUG_SUGGEST_PROMPT, max: SUGGESTED_EVENT_WORD_MAX, valid: isKidSlug },
  kid: { prompt: KID_SLUG_SUGGEST_PROMPT, max: SUGGESTED_KID_SLUG_MAX, valid: isKidSlug },
};

export const SLUG_SUGGEST_JSON_SCHEMA = {
  type: "object",
  properties: { slug: { type: "string" } },
  required: ["slug"],
};

/** `slugify` to at most `max` chars, cutting between words when it can (`tamir-bar-mitzvah-party` → `tamir-bar-mitzvah`). */
function slugifyWords(input: string, max: number): string {
  const full = slugify(input, 200);
  if (full.length <= max) return full;
  const cut = full.slice(0, max + 1).lastIndexOf("-");
  return cut > 0 ? full.slice(0, cut) : slugify(full, max);
}

/** The model's reply (any Workers AI output shape) → a valid slug of that kind (trimmed to its length), or null. */
export function parseSlugReply(out: unknown, kind: SlugKind = "group"): string | null {
  const r = replyObject(aiReplyPayload(out));
  if (!r || typeof r.slug !== "string") return null;
  const rule = KINDS[kind];
  const s = slugifyWords(r.slug, rule.max);
  return rule.valid(s) ? s : null;
}

/**
 * Asks the model for an English slug of `kind` for `name` and returns the first free variant (`slug`, `slug-2`…).
 * Never throws: any failure (model error, junk reply, nothing free, `deadline` rejecting first) gives null.
 * `deadline` is a promise the caller rejects on timeout (shared code has no timers); `onError` sees what failed.
 */
export async function suggestSlugWithAI(
  ai: AiRunner,
  model: string,
  name: string,
  taken: (slug: string) => Promise<boolean>,
  deadline?: Promise<never>,
  onError?: (e: unknown) => void,
  kind: SlugKind = "group",
): Promise<string | null> {
  const race = <T>(p: Promise<T>): Promise<T> => (deadline ? Promise.race([p, deadline]) : p);
  try {
    const input = {
      messages: [
        { role: "system", content: KINDS[kind].prompt },
        { role: "user", content: name },
      ],
      max_tokens: 60,
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: SLUG_SUGGEST_JSON_SCHEMA },
    };
    const slug = parseSlugReply(await race(ai.run(model, input)), kind);
    if (!slug) return null;
    return await race(firstFreeSlugAsync(slug, taken, 6));
  } catch (e) {
    onError?.(e);
    return null;
  }
}
