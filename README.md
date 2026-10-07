# טרמפוש (Trempush)

A mobile-first, Hebrew (RTL) carpool coordinator for parents' groups. A parent opens a group for a class or club, shares one invite link, and every family registers once (kids, car, phone). For each event, families RSVP their kids, offer cars per leg (there / back), and seat kids on a live board. Every change is logged with a 10-second undo. No accounts and no app install: on a new phone you pick your family from the group's list ("מי אתם?"), and the choice is remembered on the device.

**Trust model:** groups are small and trust each other. Anyone with the group link can act as any family and sees every family's phones and addresses; guardrails (identity chip, confirmations, undo, permission rules) prevent mistakes, not malice. Don't store sensitive data.

URLs use friendly English slugs: `/g/class-4b/e/oct-16-birthday`. Kid pages (read-only, live ride status):

- `/g/:group/kid/:kidId`: permanent link, always shows the next rides (sent from the family profile).
- `/g/:group/kid/:kidId/e/:event`: one event, both legs (sent from the event page and from driver mode).

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
            viewFor, familyLabel (same-name disambiguation), slugs, gap math,
            phone validation (+ bun tests)
worker/     Cloudflare Worker (/api router) and GroupDO (storage, actions, WebSocket, images);
            optional Google Maps and Claude-vision proxies
src/        Preact SPA: screens/ (one per route), components/, i18n/he.ts (all UI strings),
            api.ts, identity.ts (group → chosen family id), live.ts (WebSocket), nav.ts (history, sheets, scroll)
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

### Optional add-ons

The app works without these; `/api/config` reports which are on, and the UI hides what is off.

**Invitation reading** works out of the box on Cloudflare via Workers AI (the `AI` binding in `wrangler.jsonc`, free daily allowance), no key needed. The model is the `INVITE_MODEL` var (default `@cf/meta/llama-4-scout-17b-16e-instruct`; the alternative is `@cf/mistralai/mistral-small-3.1-24b-instruct`). If `ANTHROPIC_API_KEY` is set, Claude takes over automatically, which is better on stylized Hebrew. When reading fails, the form just opens empty for manual entry.

The Workers AI binding has no local simulator, so `bun run dev` stubs it (parsing returns nothing and the manual form shows). To exercise it for real locally, log in with `bunx wrangler login` (or set `CLOUDFLARE_API_TOKEN`) and run `REMOTE_BINDINGS=1 bun run dev`.

```sh
bunx wrangler secret put GOOGLE_MAPS_API_KEY   # address autocomplete, geocoding, routes
bunx wrangler secret put ANTHROPIC_API_KEY     # optional: read invitations with Claude instead of Workers AI
```

Locally, put them in `.dev.vars` (gitignored):

```
GOOGLE_MAPS_API_KEY=...
ANTHROPIC_API_KEY=...
```

## Feedback

Every screen (the kid page too) has a small floating **משוב** button. It captures a screenshot of the visible screen, then opens a sheet with a לשיפור/לשימור toggle, a text field and a voice button (recorded audio is transcribed by Workers AI Whisper and appended to the text). Route, group, acting family, app version and device details are attached automatically. The Worker always stores a JSON record (R2 `feedback/…` or the Durable Object fallback); see `docs/build-plan.md` for the API.

**GitHub issues (optional).** Create a fine-grained personal access token limited to this repository (`mamlukishay/driver`) with **Issues: read and write** and **Metadata: read**. Save it as the Actions secret `GH_FEEDBACK_TOKEN`; the deploy workflow copies it into the Worker as `GITHUB_FEEDBACK_TOKEN` (also synced when present: `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`). Each feedback then opens an issue titled `[לשיפור] …` / `[לשימור] …` with labels `feedback` + `improve`/`keep`, the transcript, an audio link, the inline screenshot and a context table. `GITHUB_REPO` overrides the target repo. If the repository is public, **feedback issues are public**.

**Auto-triage with a Claude Code routine (optional).**

1. At [claude.ai/code/routines](https://claude.ai/code/routines) create a new routine with repository `mamlukishay/driver` and no schedule.
2. Prompt: `Follow docs/feedback-agent.md in the repo. The triggering issue number is in the routine-fire-payload block.`
3. Edit → Add trigger → API → Generate token.
4. Save the trigger URL as the Actions secret `ROUTINE_FIRE_URL` and the token as `ROUTINE_FIRE_TOKEN`.

`.github/workflows/feedback-routine.yml` fires the routine for feedback issues opened by the owner's token, after a 5-minute debounce (a burst becomes one run) and with only the issue number in the payload. The routine triages every open untriaged feedback issue into one `feedback-fixes` branch and a single "Feedback fixes" PR. To review it, open a Claude Code session and say "review the feedback PR". The full procedure is in [docs/feedback-agent.md](docs/feedback-agent.md).

## Language convention

The UI is Hebrew and right-to-left; everything else is English: code, identifiers, routes, API fields and error codes, comments, commits. Every user-facing string lives in `src/i18n/he.ts` (API error codes are mapped there), and tests import that dictionary rather than hard-coding copy.

## Docs

- [docs/build-plan.md](docs/build-plan.md): stack, routes, API contract, actions and visibility rules, milestones
- [docs/workshop-spec.md](docs/workshop-spec.md): product decisions and architecture workshop record
- [docs/feedback-agent.md](docs/feedback-agent.md): instructions for the feedback-triage routine and the review flow

## Manual QA checklist

Things the automated suite cannot cover; run on a real phone against a deployed or tunneled build.

- [ ] iOS Safari: swipe-back from the left edge moves board -> event -> group; with a sheet open (`?sheet=`), swipe-back closes the sheet and stays on the board. Scroll position is restored.
- [ ] WhatsApp links (`wa.me`): invite, "share summary", "ask the group", "I left" and "I'm downstairs" open WhatsApp with the Hebrew text prefilled; the shared group link opens the app (not a blank page).
- [ ] "פתיחת קבוצת הוואטסאפ" (settings, group home) opens the linked parents' group in the WhatsApp app.
- [ ] `tel:` links: driver mode and the kid page start a call to the right person.
- [ ] Dark mode: switch the OS theme; all screens (board, sheets, toast, kid page) stay readable, with family colors distinguishable.
- [ ] Add to home screen (iOS and Android): the icon and name look right, it opens full screen, and the device identity is still there after reopening. Check the kid link too.
- [ ] Two phones side by side: seating on one updates the other without a reload, including after the screen was locked for a minute.
- [ ] Camera/gallery: picking a large photo for the invitation and the car works and stays under the upload limit.
