import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";

/** One instance per group; the source of truth for its families, events, log and images. */
export class GroupDO extends DurableObject<Env> {
  override async fetch(_request: Request): Promise<Response> {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
