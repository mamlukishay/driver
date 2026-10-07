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
  view.ts               viewFor(state, requester) → what this requester may see (phones!)
  gaps.ts               gap meter math per leg
  ids.ts                id/token generation helpers (crypto.getRandomValues)
  phone.ts              Israeli mobile validation/normalization (+9725XXXXXXXX)
  *.test.ts             bun test
worker/
  index.ts              fetch handler: /api/* router → GroupDO stub; /api/config; invite/places proxies
  group-do.ts           class GroupDO (SQLite-backed DO): storage, actions, websockets, images
  google.ts             optional Places/Routes calls (only if GOOGLE_MAPS_API_KEY)
  invite.ts             optional Claude vision parse (only if ANTHROPIC_API_KEY)
src/
  main.tsx, app.tsx     LocationProvider + Router + routes table
  i18n/he.ts            ALL user-facing strings (Hebrew). Code/keys English.
  api.ts                typed client for §3, attaches X-Family-Key, error → i18n code
  identity.ts           localStorage device identities {groupId → {familyId, key}}; safe try/catch
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
| `/join/:group` | Invite landing → registration if this device has no family in the group. |
| `/g/:group` | Group home: upcoming events with mini gap meters, "+ אירוע חדש". |
| `/g/:group/new` | Create event. Invitation image drop zone first, then a prefilled form (or manual). |
| `/g/:group/e/:event` | Event: header + RSVP for my kids (3 toggles each) + both legs' gap meters + share summary. |
| `/g/:group/e/:event/out`, `/back` | The **board** for that leg: waiting kids chips, car cards with seat slots, "+ אני נוהג/ת", history. |
| `/g/:group/e/:event/invite` | Invitation image full screen. |
| `/g/:group/e/:event/drive/:leg` | Driver mode: "יצאתי", pickup checklist, call/WhatsApp per kid/parent, Maps/Waze links. |
| `/g/:group/me` | Family profile: parents + phones, address, kids (+ optional phones, kid links), cars (seats, color, plate, photo). |
| `/g/:group/devices` | "Move to another phone": magic link `…/devices#<familyId>.<key>` (key in the fragment only). |
| `/kid/:group/:kidToken` | Kid view (read-only): per leg who picks me up, when, car photo, call driver, "אני מוכן/ה". |

Sheets use `?sheet=<name>` (pushState), so back closes the sheet. Examples: `seat` (confirm seating), `car` (offer a car).

Scroll position is restored per history entry. Never use `replaceState` for real navigation.

## 3. API contract (Worker → GroupDO)

Rules for every call:
- JSON in, JSON out. Errors: `{ error: ErrorCode }` with an HTTP status. `ErrorCode` is an English enum, and the UI maps it to Hebrew.
- Auth: header `X-Family-Key: <familyId>.<secret>`. The DO stores only `sha256(secret)` per family.
- `:group` is a random 10-char lowercase id. It is unguessable and is the only "password" for read access.

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /api/config` | – | → `{ features: { places: bool, routes: bool, inviteParse: bool } }` |
| `POST /api/groups` | – | `{ name }` → `{ groupId }` |
| `GET /api/g/:group` | optional | → `{ group, families: FamilyPublic[], events: EventSummary[], me?: FamilyPrivate }` |
| `POST /api/g/:group/families` | – | `FamilyInput` → `{ familyId, key }` (key shown once and stored on device) |
| `PUT /api/g/:group/families/me` | ✓ | `FamilyInput` → `{ me: FamilyPrivate }` |
| `POST /api/g/:group/events` | ✓ | `EventInput` → `{ eventId }` |
| `GET /api/g/:group/events/:event` | optional | → `EventView` (`viewFor` requester: seats, kids, phones only where allowed, log tail) |
| `POST /api/g/:group/events/:event/actions` | ✓ | `Action` → `{ event: EventView, logId }` · 403 `forbidden` · 409 `seat_taken` / `car_full` / `stale` · 400 `invalid` |
| `POST /api/g/:group/events/:event/undo` | ✓ | `{ logId }` → `{ event: EventView }` (only your own action, ≤ 2 min old; recorded as a compensating log entry) |
| `GET /api/g/:group/ws` | – | WebSocket upgrade. The server sends `{ t: "event", eventId, version }` / `{ t: "group", version }` after each change. |
| `POST /api/g/:group/images` | ✓ | raw image body (`image/jpeg` / `image/webp`, ≤ 400 KB) → `{ imageId }` |
| `GET /api/g/:group/images/:imageId` | – | → bytes, long cache headers |
| `GET /api/kid/:group/:kidToken` | kid token | → `KidView` |
| `POST /api/kid/:group/:kidToken/ready` | kid token | → `{ ok: true }` (logs `kidReady`, broadcasts) |
| `POST /api/g/:group/invite/parse` | ✓ | `{ imageId }` → `{ title?, date?, times?: string[], place?, address? }` · 501 `feature_off` |
| `GET /api/g/:group/places?q=` | ✓ | → `{ suggestions: { text, placeId }[] }` · 501 `feature_off` |

### Actions (shared/actions.ts)

| Action | Permission |
|---|---|
| `setKidPlan { kidId, rsvp: "yes" \| "no", out: bool, back: bool }` | Own kid only. Setting `no` (or a leg false) unseats the kid from that leg's car. |
| `offerCar { leg, carId, seats, departAt }` | Own car. One offer per family per leg. |
| `updateOffer { offerId, seats?, departAt? }` | Offer owner. `seats` may not drop below the number of kids seated. |
| `removeOffer { offerId }` | Offer owner. Its kids go back to waiting. |
| `seatKid { offerId, kidId }` | Allowed when **kid is mine** (any open offer) **or offer is mine** (any kid who needs that leg). Kid must have rsvp yes and need the leg, not already be seated on this leg, and the car must not be full. |
| `unseatKid { offerId, kidId }` | Kid's family or offer owner. |
| `startRun { offerId }` / `setPicked { offerId, kidId, picked }` | Offer owner. |
| `setKidReady { offerId, kidId, ready }` | Kid's family (the DO runs it for `/api/kid/…/ready` acting as that family). Stored in `Offer.ready`. |
| `editEvent { … }` | Host family. |

Every applied action:
1. appends a `LogEntry { id, at, familyId, action, inverse }`;
2. bumps `event.version`;
3. broadcasts.

`applyAction(state, action, actorFamilyId) → { ok, state, inverse } | { ok: false, error }` is **pure** and fully unit-tested. The DO is a thin shell around it.

### Visibility (shared/view.ts)

- Group members see names, family color, car label and photo.
- Phones are visible only:
  - between a driver and the families of kids seated in that driver's car on that leg (both directions);
  - to the host, who sees parents' phones.
- A kid's phone is visible only to the driver of a car the kid is seated in.
- Address: visible only to the driver of a car the kid is seated in (for pickup).

## 4. Storage inside GroupDO (SQLite-backed, KV API: `ctx.storage.get/put`)

```
meta                 { id, name, createdAt, version }
family:{id}          Family (incl. keyHash, kids[{id,name,phone?,kidToken}], cars[{id,label,seats,color?,plate?,photoId?}])
event:{id}           EventState (materialized; version)
log:{eventId}:{seq}  LogEntry (append-only, zero-padded seq)
img:{id}             { mime, bytes: ArrayBuffer, createdAt }
kidtoken:{token}     kidId + familyId (index)
```

## 5. UX rules (from the workshop — non-negotiable)

- **Mobile-first, RTL, Hebrew.** Big tap targets.
- **One action per screen.** The identity chip "פועל/ת בתור: משפחת X" is always visible, in the family color.
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
```

Result: `https://trempush.<account>.workers.dev`. No card needed for the base app.

## 8. Out of scope for v1

- Push/cron reminders
- Recurring events
- Auto-assignment (B's dispatcher)
- Telegram/ntfy
- Cross-group profile sync (v1 pre-fills the join form from another group's profile on the same device)
- Optimized pickup order via Routes API (v1.1)

## 9. M1 notes (as built)
- `Family.name` = family surname for the "משפחת X" chip.
- Inverses are action lists and may contain system-only actions (`clearKidPlan`, `restoreOffer`, `setRun`), accepted only with `ctx.system` (set by `undo`).
- Offer limits (second offer per leg, seats below seated / above car) → `invalid`; kid already on that leg → `seat_taken`. `stale` (version mismatch) is the DO's job.
- `shared/validate.ts`: `validateFamilyInput`, `validateEventInput`, `buildFamily`, `createEventState`. `shared/index.ts` re-exports all.
- `bun run typecheck` runs `tsc` per tsconfig (TS 7 + reference-only root checks nothing).
- Dev: after stopping `bun run dev`, vite/workerd may linger — kill them by PID.
- Images: behind an `ImageStore` interface. **R2 bucket `trempush-images` is enabled** (binding `IMAGES`); removing the binding falls back to the group DO.
