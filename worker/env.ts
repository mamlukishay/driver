import type { GroupDO } from "./group-do.ts";

export interface Env {
  GROUP: DurableObjectNamespace<GroupDO>;
  ASSETS: Fetcher;
  /** Optional R2 bucket for images; without it images live in the group DO. See wrangler.jsonc. */
  IMAGES?: R2Bucket;
  GOOGLE_MAPS_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Workers AI binding (free default for invitation parsing). Used when ANTHROPIC_API_KEY is not set. */
  AI?: Ai;
  /** Workers AI vision model for invitation parsing; see wrangler.jsonc. */
  INVITE_MODEL?: string;
}
