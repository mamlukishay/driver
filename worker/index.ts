import type { Env } from "./env.ts";
import type { ConfigResponse, CreateGroupResponse, SlugTakenResponse } from "../shared/types.ts";
import { groupId } from "../shared/ids.ts";
import { firstFreeSlugAsync, isSlug } from "../shared/slug.ts";
import { cleanText } from "../shared/validate.ts";
import { normalizeWaGroupUrl } from "../shared/whatsapp.ts";
import { ApiError, errorResponse, isObj, json, readJson } from "./http.ts";
import { handleFeedback } from "./feedback.ts";
import { handleSuggestSlug } from "./slug-suggest.ts";

export { GroupDO } from "./group-do.ts";

function configFor(env: Env): ConfigResponse {
  const maps = Boolean(env.GOOGLE_MAPS_API_KEY);
  return { features: { places: maps, routes: maps, inviteParse: Boolean(env.ANTHROPIC_API_KEY || env.AI), slugSuggest: Boolean(env.AI) } };
}

/** The group's DO, addressed by its slug. */
const groupStub = (env: Env, slug: string) => env.GROUP.get(env.GROUP.idFromName(slug));

/** "Taken" = that slug's DO already has `meta`. */
async function slugTaken(env: Env, url: URL, slug: string): Promise<boolean> {
  const r = await groupStub(env, slug).fetch(new Request(new URL(`/api/g/${slug}/__taken`, url)));
  return ((await r.json()) as { taken: boolean }).taken;
}

async function createGroup(request: Request, env: Env, url: URL): Promise<Response> {
  const body = await readJson(request);
  const name = isObj(body) ? cleanText(body.name, 60) : null;
  if (!name || !isObj(body)) throw new ApiError("invalid");
  if (body.slug !== undefined && !isSlug(body.slug)) throw new ApiError("invalid");
  let whatsappUrl: string | undefined;
  if (body.whatsappUrl !== undefined) {
    const w = typeof body.whatsappUrl === "string" ? normalizeWaGroupUrl(body.whatsappUrl) : null;
    if (w === null) throw new ApiError("invalid");
    whatsappUrl = w || undefined;
  }
  const slug = (body.slug as string | undefined) ?? groupId();
  const init = await groupStub(env, slug).fetch(
    new Request(new URL(`/api/g/${slug}/__init`, url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(whatsappUrl ? { name, whatsappUrl } : { name }),
    }),
  );
  if (init.status === 409) {
    const res: SlugTakenResponse = { error: "slug_taken" };
    const suggestion = await firstFreeSlugAsync(slug, (s) => (s === slug ? Promise.resolve(true) : slugTaken(env, url, s)), 12);
    if (suggestion) res.suggestion = suggestion;
    return json(res, 409);
  }
  if (!init.ok) throw new ApiError("invalid");
  return json({ groupId: slug } satisfies CreateGroupResponse);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const seg = url.pathname.split("/").filter(Boolean);
  if (seg[0] !== "api") throw new ApiError("not_found");
  const method = request.method;

  if (seg[1] === "config" && seg.length === 2 && method === "GET") return json(configFor(env));
  if (seg[1] === "groups" && seg.length === 2 && method === "POST") return createGroup(request, env, url);
  if (seg[1] === "groups" && seg[2] === "suggest-slug" && seg.length === 3 && method === "POST")
    return handleSuggestSlug(request, env, (s) => slugTaken(env, url, s));

  if (seg[1] === "feedback") return handleFeedback(request, env, seg, url);

  // /api/g/:group/...
  if (seg[1] === "g" && seg.length >= 3) {
    const group = seg[2]!;
    if (!isSlug(group) || seg[3]?.startsWith("__")) throw new ApiError("not_found");
    return groupStub(env, group).fetch(request);
  }
  throw new ApiError("not_found");
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.code);
      console.error("worker error", e);
      return json({ error: "invalid" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
