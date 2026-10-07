import type { Env } from "./env.ts";
import type { ConfigResponse, CreateGroupResponse } from "../shared/types.ts";
import { GROUP_ID_LENGTH, groupId, isId } from "../shared/ids.ts";
import { cleanText } from "../shared/validate.ts";
import { ApiError, errorResponse, isObj, json, readJson } from "./http.ts";

export { GroupDO } from "./group-do.ts";

function configFor(env: Env): ConfigResponse {
  const maps = Boolean(env.GOOGLE_MAPS_API_KEY);
  return { features: { places: maps, routes: maps, inviteParse: Boolean(env.ANTHROPIC_API_KEY || env.AI) } };
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const seg = url.pathname.split("/").filter(Boolean);
  if (seg[0] !== "api") throw new ApiError("not_found");
  const method = request.method;

  if (seg[1] === "config" && seg.length === 2 && method === "GET") return json(configFor(env));

  if (seg[1] === "groups" && seg.length === 2 && method === "POST") {
    const body = await readJson(request);
    const name = isObj(body) ? cleanText(body.name, 60) : null;
    if (!name) throw new ApiError("invalid");
    const id = groupId();
    const stub = env.GROUP.get(env.GROUP.idFromName(id));
    const init = await stub.fetch(
      new Request(new URL(`/api/g/${id}/__init`, url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    );
    if (!init.ok) throw new ApiError("invalid");
    return json({ groupId: id } satisfies CreateGroupResponse);
  }

  // /api/g/:group/...  and  /api/kid/:group/:token[/ready]
  if ((seg[1] === "g" || seg[1] === "kid") && seg.length >= 3) {
    const group = seg[2]!;
    if (!isId(group, GROUP_ID_LENGTH)) throw new ApiError("not_found");
    const stub = env.GROUP.get(env.GROUP.idFromName(group));
    return stub.fetch(request);
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
