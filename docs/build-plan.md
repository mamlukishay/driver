# טרמפוש — build plan (v1)

The contract the implementation agents build against. Product decisions: `docs/workshop-spec.md` §0. Visual reference: `docs/workshop.html` (palette, fonts, components, Hebrew copy).

## 1. Stack & repo layout

- **Bun**: install, scripts, `bun test`. **Vite + Preact + TypeScript (strict)**.
- `@cloudflare/vite-plugin`: `bun run dev` runs the SPA and the Worker + Durable Object locally in workerd.
- **Wrangler** via `bunx wrangler`.
- Dependencies stay minimal:
  - runtime: `preact`, `preact-iso` (History-API router);
  - dev: `vite`, `@preact/preset-vite`, `@cloudflare/vite-plugin`, `wrangler`, `@cloudflare/workers-types`, `typescript`, `@playwright/test`;
  - nothing else without a reason.

```
package.json            scripts: dev, build, preview, deploy, test, typecheck, e2e
wrangler.jsonc          worker main, assets (SPA), DO binding + sqlite migration, vars
vite.config.ts          preact() + cloudflare()
index.html              <html lang="he" dir="rtl">
shared/                 pure TS, no DOM / no Workers APIs — imported by both sides
  types.ts              domain types + API DTOs
  actions.ts            action union + reducer applyAction() + permission checks
  view.ts               viewFor(state, requester) → the event view (everyone sees everything; `me`)
  familyLabel.ts        "משפחת X" disambiguation parts for same-named families
  slug.ts               group/event slug rules, suggestions, `-2`/`-3` clash handling
  gaps.ts               gap meter math per leg
  ids.ts                short random ids (crypto.getRandomValues)
  phone.ts              Israeli mobile validation/normalization (+9725XXXXXXXX)
  *.test.ts             bun test
worker/
  index.ts              fetch handler: /api/* router → GroupDO stub; /api/config; invite/places proxies
  group-do.ts           class GroupDO (SQLite-backed DO): storage, actions, websockets, images
  google.ts             optional Places/Routes calls (only if GOOGLE_MAPS_API_KEY)
  invite.ts             invitation parse: Claude if ANTHROPIC_API_KEY, else Workers AI (AI binding); pure JSON parser in shared/inviteParse.ts
src/
  main.tsx, app.tsx     LocationProvider + Router + routes table
  i18n/he.ts            ALL user-facing strings (Hebrew). Code/keys English.
  api.ts                typed client for §3, attaches X-Family-Id, error → i18n code
  identity.ts           localStorage `trempush.identities` = {groupSlug → familyId}; safe try/catch
  live.ts               WebSocket subscribe per group/event + refetch fallback
  styles/tokens.css     palette/fonts from workshop.html (light + dark), logical CSS props only
  components/           Header (identity chip), Sheet (?sheet= aware), Toast (undo), SeatCar, KidChip, GapMeter, WaPreview…
  screens/              one file per route (§2)
e2e/                    Playwright smoke (mobile viewport, Hebrew)
```

## 2. Routes (each a real URL; browser back/forward and iOS swipe must work)

| Route | Screen |
|---|---|
| `/` | My groups on this device. "צור קבוצה חדשה" (name → invite link to share). |
| `/new-group` | Create group form. |
| `/join/:group` | Invite link. No family on this device → "מי אתם?". `?new=1` → registration form (warns when the family name already exists: "זו המשפחה שלכם?"). |
| `/g/:group/who?next=` | "מי אתם?": the group's families as big buttons (color dot, label, kids' names) → confirm sheet → back to `next`. Also "משפחה חדשה — הרשמה" and "רק להסתכל" (view-only for this tab). |
| `/g/:group/settings` | Acting as family X · "החלפת משפחה" · "עריכת פרטי המשפחה" · "התנתקות מהטלפון הזה" · group link + WhatsApp. From the header gear and the identity chip. |
| `/g/:group` | Group home: upcoming events with mini gap meters, "+ אירוע חדש". |
| `/g/:group/new` | Create event. Invitation image drop zone first, then a prefilled form (or manual). |
| `/g/:group/e/:event` | Event: header + RSVP for my kids (3 toggles each; with rsvp yes, a "שליחה ל{kid}" WhatsApp button: event, one line per leg, the per-event kid link) + both legs' gap meters + share summary. |
| `/g/:group/e/:event/out`, `/back` | The **board** for that leg: waiting kids chips, car cards with seat slots, "+ אני נוהג/ת", history. |
| `/g/:group/e/:event/invite` | Invitation image full screen. |
| `/g/:group/e/:event/drive/:leg` | Driver mode: "יצאתי", "שיתוף עם הנוסעים" (per kid in the car: WhatsApp with the per-event kid link, to the kid's phone, else the parent's, else the chooser; highlighted and scrolled to after "יצאתי"), pickup checklist in pickup order with "הגעתי" (`setArrived`) and "עלה/תה" per stop, call/WhatsApp ("אני למטה") per kid/parent, Maps/Waze links. |
| `/g/:group/me` | Family profile: parents + phones, address, kids (+ optional phones, kid links), cars (seats, color, plate, photo). |
| `/g/:group/kid/:kidId` | Kid view, permanent link (read-only, never asks "מי אתם?"): the next upcoming rides; per leg a big live status, who picks me up, when, car photo, call driver, "אני מוכן/ה". Old `/kid/:group/:token` links redirect here. |
| `/g/:group/kid/:kidId/e/:event` | Kid view focused on one event (both legs, any date), same live status. Shared from the event page and driver mode. |

**Kid live status** (`kidLegStatus` in `shared/view.ts`, per leg the kid needs): `waiting` (no car) → `assigned` (driver, time, car photo) → `onTheWay` (run started) → `next` (run started and every earlier stop in the pickup order is picked; `KidRide.ahead === 0`) → `arrived` (driver tapped "הגעתי" at this kid's stop) → `picked` → `done`. `done` once the leg is over (`legOver`: 30 min after the start for out, 90 min after the return time for back, on the client's local clock), except while a started run hasn't picked the kid yet. Pickup order (`pickupStops`, also used by driver mode): out = one stop per family in seating order; back = one stop (everyone boards at the venue). Both kid pages subscribe to the group WebSocket and refetch on event updates.

Every `/g/:group/…` route except `who` and `kid`, and `/join/:group`, sends a device with no family for that group (and not in "רק להסתכל" mode) to `/g/:group/who?next=<original URL>` (a replace, so back doesn't bounce).

Slugs (`shared/slug.ts`): lowercase a-z, 0-9 and hyphen, 3–40 chars, no leading/trailing hyphen.
- `:group` is chosen at creation (English URL name, prefilled from Latin letters/digits in the name, else `group-<4 random>`). Groups created before slugs keep their random 10-char id, which is also a valid slug.
- `:event` is generated by the DO: `<mon>-<day>` from the date (`oct-16`), plus the optional English word from the form (`oct-16-birthday`), `-2`/`-3` on a clash. Immutable: editing the date keeps it.
- `:kidId` is the kid's short id. Families have no slugs.

Sheets use `?sheet=<name>` (pushState), so back closes the sheet. Examples: `seat` (confirm seating), `car` (offer a car), `feedback` (the in-app feedback sheet, opened from the floating "משוב" button on every screen, kid page included).

Scroll position is restored per history entry. Never use `replaceState` for real navigation.

## 3. API contract (Worker → GroupDO)

Rules for every call:
- JSON in, JSON out. Errors: `{ error: ErrorCode }` with an HTTP status. `ErrorCode` is an English enum, and the UI maps it to Hebrew.
- Identity: header `X-Family-Id: <familyId>`. The server only checks that the family exists in the group (unknown → 403 `forbidden`). There is no secret.
- **Trust model:** anyone with the group link can act as any family; guardrails (identity chip, confirmation sheets, undo, the permission rules below) prevent mistakes, not malice. Don't store sensitive data.
- `:group` is the group slug; the Worker addresses the DO with `idFromName(slug)`. `/api/g/:group/__*` paths are internal (Worker → DO) and 404 from outside.

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /api/config` | – | → `{ features: { places: bool, routes: bool, inviteParse: bool } }` |
| `POST /api/groups` | – | `{ name, slug }` → `{ groupId: slug }` · 400 `invalid` (bad slug) · 409 `{ error: "slug_taken", suggestion: "slug-2" }` ("taken" = that DO already has `meta`). No `slug` → a random 10-char one. |
| `GET /api/g/:group` | optional | → `{ group, families: FamilyPublic[] (incl. phones, address), events: EventSummary[], me?: FamilyPrivate }` |
| `POST /api/g/:group/families` | – | `FamilyInput` → `{ familyId }` (stored on the device) |
| `PUT /api/g/:group/families/me` | ✓ | `FamilyInput` → `{ me: FamilyPrivate }` |
| `POST /api/g/:group/events` | ✓ | `EventInput & { slugWord? }` → `{ eventId }` (the event slug) · 400 when `slugWord` has no Latin letters/digits |
| `GET /api/g/:group/events/:event` | optional | → `EventView` (seats, kids, everyone's phones and addresses, log tail, `me`) |
| `POST /api/g/:group/events/:event/actions` | ✓ | `Action` → `{ event: EventView, logId }` · 403 `forbidden` · 409 `seat_taken` / `car_full` / `stale` · 400 `invalid` |
| `POST /api/g/:group/events/:event/undo` | ✓ | `{ logId }` → `{ event: EventView }` (only your own action, ≤ 2 min old; recorded as a compensating log entry) |
| `GET /api/g/:group/ws` | – | WebSocket upgrade. The server sends `{ t: "event", eventId, version }` / `{ t: "group", version }` after each change. |
| `POST /api/g/:group/images` | ✓ | raw image body (`image/jpeg` / `image/webp`, ≤ 400 KB) → `{ imageId }` |
| `GET /api/g/:group/images/:imageId` | – | → bytes, long cache headers |
| `GET /api/g/:group/kid/:kidId[?event=<slug>]` | – | → `KidView` (also accepts a legacy kid token). Without `event`: upcoming events. With `event`: only that event, any date · 404 when it doesn't exist. Each `KidRide` carries `started`, `picked`, `ready`, `arrived`, `ahead` (unpicked kids at earlier stops). |
| `POST /api/g/:group/kid/:kidId/ready` | – | `{ ready?: bool, event?: slug }` → `{ ok: true }` (logs `setKidReady` as the kid's family on the earliest unpicked ride, within `event` when given; broadcasts) · 404 when there is none |
| `POST /api/g/:group/invite/parse` | ✓ | `{ imageId }` → `{ title?, date?, times?: string[], place?, address? }` · 501 `feature_off` |
| `GET /api/g/:group/places?q=` | ✓ | → `{ suggestions: { text, placeId }[] }` · 501 `feature_off` |
| `POST /api/feedback/audio` | – | raw audio body (`audio/webm` / `mp4` / `ogg` …, ≤ 3 MB) → `{ audioId, transcript: string \| null }` (Workers AI Whisper `@cf/openai/whisper-large-v3-turbo`, Hebrew; any AI failure → `null`) |
| `GET /api/feedback/audio/:audioId` | – | → bytes |
| `POST /api/feedback/screenshot` | – | raw image body (`image/jpeg` / `png` / `webp`, ≤ 600 KB) → `{ screenshotId }` |
| `GET /api/feedback/screenshot/:screenshotId` | – | → bytes |
| `POST /api/feedback` | – | `{ kind: "improve" \| "keep", text (≤ 4000), audioId?, transcript?, screenshotId?, context }` → `{ ok: true, id, issueUrl? }`. Always stores a JSON record; opens a GitHub issue when `GITHUB_FEEDBACK_TOKEN` is set (a GitHub failure still returns ok). |

Feedback endpoints (`worker/feedback.ts`, pure parts in `shared/feedback.ts`) have no auth, size caps, and a naive per-isolate rate limit of 10 requests/min/IP per endpoint (429 `rate_limited`). `context` is auto-collected by the client: route, group id/name, acting family id/name, kid-page flag, app version (`__APP_VERSION__`), user agent, viewport, time, screenshot state (`attached` / `removed` / `failed` / `none`).

### Actions (shared/actions.ts)

| Action | Permission |
|---|---|
| `setKidPlan { kidId, rsvp: "yes" \| "no", out: bool, back: bool }` | Own kid only. Setting `no` (or a leg false) unseats the kid from that leg's car. |
| `offerCar { leg, carId, seats, departAt }` | Own car. One offer per family per leg. |
| `updateOffer { offerId, seats?, departAt? }` | Offer owner. `seats` may not drop below the number of kids seated. |
| `removeOffer { offerId }` | Offer owner. Its kids go back to waiting. |
| `seatKid { offerId, kidId }` | Allowed when **kid is mine** (any open offer) **or offer is mine** (any kid who needs that leg). Kid must have rsvp yes and need the leg, not already be seated on this leg, and the car must not be full. |
| `unseatKid { offerId, kidId }` | Kid's family or offer owner. |
| `startRun { offerId }` / `setPicked { offerId, kidId, picked }` | Offer owner. Picking a kid also clears their `arrived`. |
| `setArrived { offerId, kidId, arrived }` | Offer owner; needs a started run; `arrived: true` is invalid for a picked kid. Stored in `Run.arrived: kidId[]` (absent when empty). Inverse: `setArrived` with the previous value. |
| `setKidReady { offerId, kidId, ready }` | Kid's family (the DO runs it for `/api/g/…/kid/…/ready` acting as that family). Stored in `Offer.ready`. |
| `editEvent { … }` | Host family. |

Every applied action:
1. appends a `LogEntry { id, at, familyId, action, inverse }`;
2. bumps `event.version`;
3. broadcasts.

`applyAction(state, action, actorFamilyId) → { ok, state, inverse } | { ok: false, error }` is **pure** and fully unit-tested. The DO is a thin shell around it.

The permission rules are keyed by the actor family id (`X-Family-Id`). They stop accidents, not malice (see the trust model above).

### Visibility (shared/view.ts)

- Families in a group trust each other: every member (and anyone with the group link) sees all families' parents' phones, kids' phones and addresses, names, colors, cars and photos.
- Never add sensitive fields to `Family`.

### Family labels (shared/familyLabel.ts)

Families are identified by id; names may collide. `familyLabel(family, all)` returns the parts and `he.familyLabel` formats them: "משפחת כהן" when unique; otherwise, each step only while still colliding: first 2 kid names → + a parent's first name → + street (address text before the first digit/comma) → an ordinal by creation order ("משפחת כהן 2"). Used by the identity chip, car cards, log lines, the WhatsApp summary, settings and the picker.

## 4. Storage inside GroupDO (SQLite-backed, KV API: `ctx.storage.get/put`)

```
meta                 { id (= group slug), name, createdAt, version }
family:{id}          Family (kids[{id,name,phone?}], cars[{id,label,seats,color?,plate?,photoId?}])
event:{slug}         EventState (materialized; version; `id` = slug)
log:{eventSlug}:{seq} LogEntry (append-only, zero-padded seq)
img:{id}             { mime, bytes: ArrayBuffer, createdAt }
```

Older stored families may still carry `keyHash` / `kidToken`; they are ignored (stripped from responses), and old kid tokens are still accepted on the kid API.

```
```

Feedback storage: with the R2 binding `IMAGES`, records go to `feedback/{yyyy-mm-dd}/{id}.json`, audio to `feedback-audio/{id}`, screenshots to `feedback-shots/{id}`. Without R2 the same keys live in a dedicated GroupDO instance (`idFromName("__feedback__")`, keys prefixed `fb:`; blobs split into 1 MB chunks).

## 5. UX rules (from the workshop — non-negotiable)

- **Mobile-first, RTL, Hebrew.** Big tap targets.
- **One action per screen.** The identity chip "פועל/ת בתור: משפחת X" is always visible, in the family color, and opens settings (switch family, sign out).
- **Writes that affect another family** use a sentence confirmation sheet ("להושיב את נועה ברכב של משפחת לוי, הלוך, 09:30?"). After any write, a 10 s undo toast.
- **Gap meter per leg**, in three states:
  - "חסרים N מקומות" (amber)
  - "יש מקום לכולם · N ממתינים לשיבוץ"
  - "כולם מסודרים ✓" (green)
- **WhatsApp**: buttons open `https://wa.me/<972…>?text=` (to a person) or `https://wa.me/?text=` (group chooser).
  - Texts come from `i18n/he.ts` templates.
  - Includes "שתף סיכום לקבוצה", "בקש מהקבוצה", "יצאתי", "אני למטה".
- **Navigation**: Google Maps multi-stop URL (≤ 8 waypoints) and a Waze link to the next stop.
- **Images**: before upload, resize on canvas to max 1600px (invite) / 800px (car), JPEG q≈0.8, and keep under 400 KB.
- **Feature flags** from `/api/config`. When off, the UI simply doesn't offer that feature (e.g. "מזהה פרטים…" never shows without `inviteParse`).

## 6. Milestones & agent assignment

| # | Milestone | Owner | Done when |
|---|---|---|---|
| M1 | Scaffold + `shared/` domain (types, reducer, permissions, view, gaps, phone) + tests | Opus | `bun test` green; `bun run typecheck` clean; `bun run build` builds SPA + worker |
| M2a | Worker + GroupDO implementing §3/§4 (incl. WebSocket hibernation, images, kid token, config, optional Google/Claude proxies) | Sonnet | `bun run dev` serves `/api/*` locally; curl smoke script passes |
| M2b | Frontend screens §2 against §3 (`api.ts` typed from `shared/types.ts`), tokens/fonts from workshop | Opus | Every route renders; full flow works against local dev |
| M3 | Playwright e2e smoke (create group → register 2 families on 2 contexts → event → offer car → seat other kid → undo → kid page) + README deploy steps | Sonnet | `bun run e2e` green |
| M4 | Polish pass: back/forward + sheet behavior on WebKit, dark mode, empty states, error copy | Opus | manual checklist in README |

M2a and M2b run in parallel after M1. They share only `shared/`, which is frozen after M1; any change goes through the architect.

## 7. Deploy (free)

```
bun install
bunx wrangler login
bun run deploy                     # vite build + wrangler deploy
# optional add-ons:
bunx wrangler secret put GOOGLE_MAPS_API_KEY
bunx wrangler secret put ANTHROPIC_API_KEY
bunx wrangler secret put GITHUB_FEEDBACK_TOKEN   # feedback → GitHub issues (see README "Feedback")
```

Result: `https://trempush.<account>.workers.dev`. No card needed for the base app.

## 8. Out of scope for v1

- Push/cron reminders
- Recurring events
- Auto-assignment (B's dispatcher)
- Telegram/ntfy
- Cross-group profile sync
- Optimized pickup order via Routes API (v1.1)

## 9. M1 notes (as built)
- `Family.name` = family surname for the "משפחת X" chip.
- Inverses are action lists and may contain system-only actions (`clearKidPlan`, `restoreOffer`, `setRun`), accepted only with `ctx.system` (set by `undo`).
- Offer limits (second offer per leg, seats below seated / above car) → `invalid`; kid already on that leg → `seat_taken`. `stale` (version mismatch) is the DO's job.
- `shared/validate.ts`: `validateFamilyInput`, `validateEventInput`, `buildFamily`, `createEventState`. `shared/index.ts` re-exports all.
- `bun run typecheck` runs `tsc` per tsconfig (TS 7 + reference-only root checks nothing).
- Dev: after stopping `bun run dev`, vite/workerd may linger — kill them by PID.
- Images: behind an `ImageStore` interface. **R2 bucket `trempush-images` is enabled** (binding `IMAGES`); removing the binding falls back to the group DO.
