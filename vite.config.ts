import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The `AI` (Workers AI) binding has no local simulator: in dev it proxies to Cloudflare and needs a login or
// CLOUDFLARE_API_TOKEN. Remote bindings are therefore opt-in (`REMOTE_BINDINGS=1 bun run dev`); by default the
// binding is a local stub whose calls fail, and invitation parsing falls back to "fill it in by hand".
const remoteBindings = process.env.REMOTE_BINDINGS === "1" || Boolean(process.env.CLOUDFLARE_API_TOKEN);

export default defineConfig({
  plugins: [preact(), cloudflare({ remoteBindings })],
});
