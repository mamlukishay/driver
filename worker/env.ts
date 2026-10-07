import type { GroupDO } from "./group-do.ts";

export interface Env {
  GROUP: DurableObjectNamespace<GroupDO>;
  ASSETS: Fetcher;
  GOOGLE_MAPS_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}
