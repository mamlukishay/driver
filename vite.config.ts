import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The `AI` (Workers AI) binding has no local simulator: in dev it proxies to Cloudflare and needs a login or
// CLOUDFLARE_API_TOKEN. Remote bindings are therefore opt-in (`REMOTE_BINDINGS=1 bun run dev`); by default the
// binding is a local stub whose calls fail, and invitation parsing falls back to "fill it in by hand".
const remoteBindings = process.env.REMOTE_BINDINGS === "1" || Boolean(process.env.CLOUDFLARE_API_TOKEN);

/** Build identifier attached to feedback reports: `<package version>+<short sha>` (CI: GITHUB_SHA). */
function appVersion(): string {
  let version = "0.0.0";
  try {
    version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version?: string }).version ?? version;
  } catch {
    /* keep default */
  }
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      sha = "";
    }
  }
  return sha ? `${version}+${sha}` : version;
}

// Local fake sign-in (`/auth/dev-login`, worker/auth.ts) for dev and e2e: only `vite dev` (never a build, so
// it can't reach a deploy) and only when the shell sets AUTH_DEV_LOGIN=1 (playwright.config.ts does).
// The worker also refuses it on any host but localhost.
const devLogin = (command: string) => command === "serve" && process.env.AUTH_DEV_LOGIN === "1";

export default defineConfig(({ command }) => ({
  plugins: [
    preact(),
    cloudflare({
      remoteBindings,
      ...(devLogin(command) ? { config: (c) => ({ vars: { ...c.vars, AUTH_DEV_LOGIN: "1" } }) } : {}),
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
}));
