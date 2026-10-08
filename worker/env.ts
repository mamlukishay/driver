import type { GroupDO } from "./group-do.ts";
import type { UserDO } from "./user-do.ts";

export interface Env {
  GROUP: DurableObjectNamespace<GroupDO>;
  /** One per signed-in account (optional Google sign-in), addressed by `idFromName("g:<sub>")`. */
  USER: DurableObjectNamespace<UserDO>;
  ASSETS: Fetcher;
  /** Optional R2 bucket for images; without it images live in the group DO. See wrangler.jsonc. */
  IMAGES?: R2Bucket;
  GOOGLE_MAPS_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Workers AI binding (free default for invitation parsing). Used when ANTHROPIC_API_KEY is not set. */
  AI?: Ai;
  /** Workers AI vision model for invitation parsing; see wrangler.jsonc. */
  INVITE_MODEL?: string;
  /** Fine-grained PAT (Issues: read/write) for opening feedback issues; optional. See README "Feedback". */
  GITHUB_FEEDBACK_TOKEN?: string;
  /** `owner/repo` for feedback issues; defaults to mamlukishay/driver. */
  GITHUB_REPO?: string;
  /** Google OAuth client for optional sign-in; both set → `features.accounts`. See README "Optional add-ons". */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * "1" enables `/auth/dev-login` (fake sign-in) on localhost only. Set by vite.config.ts in `vite dev`
   * when the shell has AUTH_DEV_LOGIN=1 (Playwright does); never in wrangler.jsonc or the deploy workflow.
   */
  AUTH_DEV_LOGIN?: string;
}
