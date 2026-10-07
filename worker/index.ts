import type { Env } from "./env.ts";
import type { ConfigResponse, ErrorCode } from "../shared/types.ts";

export { GroupDO } from "./group-do.ts";

function configFor(env: Env): ConfigResponse {
  const maps = Boolean(env.GOOGLE_MAPS_API_KEY);
  return { features: { places: maps, routes: maps, inviteParse: Boolean(env.ANTHROPIC_API_KEY) } };
}

function error(code: ErrorCode, status: number): Response {
  return Response.json({ error: code }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/config") {
      return Response.json(configFor(env));
    }
    return error("not_found", 404);
  },
} satisfies ExportedHandler<Env>;
