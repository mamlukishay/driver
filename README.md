# טרמפוש (Trempush)

A mobile-first, Hebrew (RTL) carpool coordinator for parents' groups. A parent opens a group for a class or club, shares one invite link, and every family registers once (kids, car, phone). For each event, families RSVP their kids, offer cars per leg (there / back), and seat kids on a live board. Every change is logged with a 10-second undo, and phone numbers are only revealed between a driver and the families of the kids in that car. No accounts and no app install: a family is identified by a key stored on the device.

## Stack

- Bun (package manager, scripts, `bun test`)
- Vite + Preact + TypeScript (strict), `preact-iso` for History-API routing
- Cloudflare Worker + SQLite-backed Durable Object (one per group), WebSocket live updates, static assets with SPA fallback
- Images in R2 (see below)
- Playwright for end-to-end tests

## Local development

```sh
bun install
bun run dev        # SPA + Worker + Durable Object in workerd, http://localhost:5173
bun test           # unit tests for the shared domain (shared/*.test.ts)
bun run typecheck
bun run build
bun run e2e        # Playwright, starts its own dev server on port 5200 (or reuses one)
bun scripts/api-smoke.ts http://localhost:5173   # curl-style API smoke against a running dev server
```

Notes:
- `bun run e2e` needs a Chromium build. It uses `PLAYWRIGHT_BROWSERS_PATH` (or `/opt/pw-browsers`); the WebKit project is added automatically only if a WebKit build exists there. Otherwise run `bunx playwright install chromium` once.
- After stopping `bun run dev`, `vite`/`workerd` may linger. Kill them by PID, not by pattern.

## Project layout

```
shared/     pure TS domain used by both sides: types, action reducer + permissions,
            viewFor (who may see which phone), gap math, phone validation (+ bun tests)
worker/     Cloudflare Worker (/api router) and GroupDO (storage, actions, WebSocket, images);
            optional Google Maps and Claude-vision proxies
src/        Preact SPA: screens/ (one per route), components/, i18n/he.ts (all UI strings),
            api.ts, identity.ts (device keys), live.ts (WebSocket), nav.ts (history, sheets, scroll)
e2e/        Playwright specs (mobile viewport, Hebrew)
scripts/    api-smoke.ts
docs/       build-plan.md (contract), workshop-spec.md (product/architecture decisions), workshop.html
wrangler.jsonc, vite.config.ts, playwright.config.ts
```

## Deploy to Cloudflare (free plan)

**Automatic (GitHub Actions):** `.github/workflows/deploy.yml` runs tests, typecheck and build on every push, then `wrangler deploy` when the repository secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers", plus R2 edit) and `CLOUDFLARE_ACCOUNT_ID` are set. Without them it builds and skips the deploy.

**Manual:**

```sh
bun install
bunx wrangler login
bun run deploy      # vite build + wrangler deploy
```

The app is served at `https://trempush.<your-account>.workers.dev`. The base app needs no card.

### Images and the R2 bucket `trempush-images`

Invitation images and car photos are stored in the R2 bucket `trempush-images`, bound as `IMAGES` in `wrangler.jsonc`. Locally, `bun run dev` simulates R2, so nothing needs creating. For a real deploy, enable R2 on the account once and create the bucket if it does not exist (`bunx wrangler r2 bucket create trempush-images`).

To fall back to storing images inside each group's Durable Object (no R2, no extra setup), delete the `r2_buckets` entry from `wrangler.jsonc` and redeploy. The worker picks the store at runtime, so no code change is needed. Images already in R2 are not migrated.

### Optional features (secrets)

The app works without these; `/api/config` reports which are on, and the UI hides what is off.

```sh
bunx wrangler secret put GOOGLE_MAPS_API_KEY   # address autocomplete, geocoding, routes
bunx wrangler secret put ANTHROPIC_API_KEY     # read details from an invitation image
```

Locally, put them in `.dev.vars` (gitignored):

```
GOOGLE_MAPS_API_KEY=...
ANTHROPIC_API_KEY=...
```

## Language convention

The UI is Hebrew and right-to-left; everything else is English: code, identifiers, routes, API fields and error codes, comments, commits. Every user-facing string lives in `src/i18n/he.ts` (API error codes are mapped there), and tests import that dictionary rather than hard-coding copy.

## Docs

- [docs/build-plan.md](docs/build-plan.md): stack, routes, API contract, actions and visibility rules, milestones
- [docs/workshop-spec.md](docs/workshop-spec.md): product decisions and architecture workshop record

## Manual QA checklist

Things the automated suite cannot cover; run on a real phone against a deployed or tunneled build.

- [ ] iOS Safari: swipe-back from the left edge moves board -> event -> group; with a sheet open (`?sheet=`), swipe-back closes the sheet and stays on the board. Scroll position is restored.
- [ ] WhatsApp links (`wa.me`): invite, "share summary", "ask the group", "I left" and "I'm downstairs" open WhatsApp with the Hebrew text prefilled; the shared group link opens the app (not a blank page).
- [ ] `tel:` links: driver mode and the kid page start a call to the right person.
- [ ] Dark mode: switch the OS theme; all screens (board, sheets, toast, kid page) stay readable, with family colors distinguishable.
- [ ] Add to home screen (iOS and Android): the icon and name look right, it opens full screen, and the device identity is still there after reopening. Check the kid link too.
- [ ] Two phones side by side: seating on one updates the other without a reload, including after the screen was locked for a minute.
- [ ] Camera/gallery: picking a large photo for the invitation and the car works and stays under the upload limit.
