import type { GroupDO } from "./group-do.ts";

export interface Env {
  GROUP: DurableObjectNamespace<GroupDO>;
  ASSETS: Fetcher;
  /** Optional R2 bucket for images; without it images live in the group DO. See wrangler.jsonc. */
  IMAGES?: R2Bucket;
  GOOGLE_MAPS_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}
