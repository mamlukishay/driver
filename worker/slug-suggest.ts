import type { SuggestSlugResponse } from "../shared/types.ts";
import { type AiRunner, type SlugKind, suggestSlugWithAI } from "../shared/slugSuggest.ts";
import { cleanText } from "../shared/validate.ts";
import type { Env } from "./env.ts";
import { ApiError, isObj, json, readJson } from "./http.ts";

/** Workers AI text model for URL-name suggestions: good Hebrew understanding, fast, supports JSON mode. */
export const SLUG_SUGGEST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
/** A slow model must not hang a form: give up (→ `{}`) after this. */
const SLUG_SUGGEST_TIMEOUT_MS = 4000;

/** Asks Workers AI for a free slug of `kind` for `name`. Never throws: no binding or any AI trouble → `{}`. */
export async function aiSlugSuggestion(
  env: Env,
  name: string,
  kind: SlugKind,
  taken: (slug: string) => Promise<boolean>,
): Promise<SuggestSlugResponse> {
  const res: SuggestSlugResponse = {};
  if (!env.AI) return res;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), SLUG_SUGGEST_TIMEOUT_MS);
  });
  deadline.catch(() => {}); // rejecting after the race settled must not be an unhandled rejection
  try {
    const slug = await suggestSlugWithAI(
      env.AI as unknown as AiRunner,
      SLUG_SUGGEST_MODEL,
      name,
      taken,
      deadline,
      (e) => console.error(`${kind} slug suggestion failed`, e instanceof Error ? e.message : String(e)),
      kind,
    );
    if (slug) res.slug = slug;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return res;
}

/** `POST /api/groups/suggest-slug` `{ name }` → `{ slug? }`. Only a bad body is an error; any AI trouble → `{}`. */
export async function handleSuggestSlug(request: Request, env: Env, taken: (slug: string) => Promise<boolean>): Promise<Response> {
  const body = await readJson(request);
  const name = isObj(body) ? cleanText(body.name, 60) : null;
  if (!name) throw new ApiError("invalid");
  return json(await aiSlugSuggestion(env, name, "group", taken));
}
