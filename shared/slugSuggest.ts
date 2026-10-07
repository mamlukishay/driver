/** English URL-name suggestion for a (usually Hebrew) group name, via an LLM. Pure parts; the Worker wires the AI binding. */
import { aiReplyPayload, replyObject } from "./aiReply.ts";
import { firstFreeSlugAsync, isSlug, slugify } from "./slug.ts";

/** Anything with Workers AI's `run(model, input)` shape (the `Ai` binding, or a test double). */
export interface AiRunner {
  run(model: string, input: unknown): Promise<unknown>;
}

/** Longest suggestion we keep (leaves room for a `-2` suffix within SLUG_MAX). */
export const SUGGESTED_SLUG_MAX = 30;

export const SLUG_SUGGEST_PROMPT =
  "You name carpool groups of parents (a school class, a kindergarten, a sports team, a birthday or bar mitzvah, a trip). " +
  "Given the group's name (usually Hebrew), return ONLY JSON: {\"slug\": \"...\"}. " +
  "The slug is 1-4 short lowercase English words joined by hyphens, at most 30 characters, only a-z, 0-9 and hyphens. " +
  "Transliterate people's and place names to their common English spelling (תומר→tomer, גבעתיים→givatayim, רעננה→raanana). " +
  "Translate common words (כיתה→class, גן→kindergarten, בר מצווה→bar-mitzvah, בת מצווה→bat-mitzvah, יום הולדת→birthday, כדורגל→soccer, חוג→club). " +
  "Hebrew letters used as numbers become digits (א=1, ב=2, ג=3, ד=4, ה=5, ו=6). Keep digits. " +
  'Examples: "בר מצווה לתומר" → {"slug": "tomer-bar-mitzvah"}; "כיתה ד׳2 גבעתיים" → {"slug": "class-4-2-givatayim"}; ' +
  '"גן חבצלת" → {"slug": "kindergarten-havatzelet"}.';

export const SLUG_SUGGEST_JSON_SCHEMA = {
  type: "object",
  properties: { slug: { type: "string" } },
  required: ["slug"],
};

/** The model's reply (any Workers AI output shape) → a valid slug, or null. */
export function parseSlugReply(out: unknown): string | null {
  const r = replyObject(aiReplyPayload(out));
  if (!r || typeof r.slug !== "string") return null;
  const s = slugify(r.slug, SUGGESTED_SLUG_MAX);
  return isSlug(s) ? s : null;
}

/**
 * Asks the model for an English slug for `name` and returns the first free variant (`slug`, `slug-2`…).
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
): Promise<string | null> {
  const race = <T>(p: Promise<T>): Promise<T> => (deadline ? Promise.race([p, deadline]) : p);
  try {
    const input = {
      messages: [
        { role: "system", content: SLUG_SUGGEST_PROMPT },
        { role: "user", content: name },
      ],
      max_tokens: 60,
      temperature: 0.1,
      response_format: { type: "json_schema", json_schema: SLUG_SUGGEST_JSON_SCHEMA },
    };
    const slug = parseSlugReply(await race(ai.run(model, input)));
    if (!slug) return null;
    return await race(firstFreeSlugAsync(slug, taken, 6));
  } catch (e) {
    onError?.(e);
    return null;
  }
}
