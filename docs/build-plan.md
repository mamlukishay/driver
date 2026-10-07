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
public/_headers         asset response headers: the app shell (every SPA route) `no-store`, `/assets/*` immutable
shared/                 pure TS, no DOM / no Workers APIs — imported by both sides
  types.ts              domain types + API DTOs
  actions.ts            action union + reducer applyAction() + permission checks
  view.ts               viewFor(state, requester) → the event view (everyone sees everything; `me`)
  familyLabel.ts        "משפחת X" disambiguation parts for same-named families
  myGroups.ts           my-groups order (last used), next event date, join prefill from another group
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
  identity.ts           localStorage `trempush.identities` = {groupSlug → familyId}; `trempush.lastUsed` = {groupSlug → epoch ms} (separate key, so the identities format is unchanged); safe try/catch
  live.ts               WebSocket subscribe per group/event + refetch fallback
  styles/tokens.css     palette/fonts from workshop.html (light + dark), logical CSS props only
  components/           Header (identity chip), Sheet (?sheet= aware), Toast (undo), SeatCar, KidChip, GapMeter, WaPreview…
  screens/              one file per route (§2)
e2e/                    Playwright smoke (mobile viewport, Hebrew)
```

## 2. Routes (each a real URL; browser back/forward and iOS swipe must work)

| Route | Screen |
|---|---|
| `/` | My groups on this device, most recently used first (`trempush.lastUsed`, set when a group screen with a header opens and on choosing/registering a family). Each row: group name, my kids in that group, "האירוע הבא: <date>" when there is an upcoming non-cancelled event. "צור קבוצה חדשה" (name → invite link to share). A stored group whose fetch 404s (deleted) is forgotten (identity and `lastUsed` removed) and drops off the list. |
| `/new-group` | Create group form: name, English URL name (follows the name until edited: Latin letters/digits instantly; a name without them, e.g. Hebrew, keeps the `group-<4 random>` fallback and, when `features.slugSuggest`, asks `POST /api/groups/suggest-slug` 500 ms after the last keystroke, with a spinner in the field, and applies the reply only if the URL name is still untouched and the name unchanged; editing the URL name cancels it), optional "קישור לקבוצת הוואטסאפ (לא חובה)" (`whatsappUrl`, hint "קישור הזמנה מהגדרות הקבוצה בוואטסאפ"; invalid → form error). |
| `/join/:group` | Invite link. No family on this device → "מי אתם?". `?new=1` → registration form (warns when the family name already exists: "זו המשפחה שלכם?"). When this device has a family in other groups, the form is prefilled from one of them (`GET /api/g/:other` with that group's `X-Family-Id`, `me`): a select "העתקה מ:" (default the most recently used group; "בלי העתקה" clears it) copies family name, parents, address and cars (label, seats, color, plate; no photos, since images are per group). Kids become a checkbox list "מי מהילדים בקבוצה הזו?", all unchecked, plus "+ ילד/ה"; only checked or added kids are registered, at least one is required. An independent copy: no cross-group sync. |
| `/g/:group/who?next=` | "מי אתם?": the group's families as big buttons (color dot, label, kids' names) → confirm sheet → back to `next`. Also "משפחה חדשה — הרשמה" and "רק להסתכל" (view-only for this tab). |
| `/g/:group/settings` | Header: the title is the group name with a small muted gear + "הגדרות הקבוצה" line under it, no gear on this screen, and the identity chip drops its "· group" suffix wherever the title is the group name (settings, group home). Cards with one anatomy (muted `.hs` heading, optional one-line hint, content, actions); color only for meaning. "המשפחה בטלפון הזה": the family row (color dot + label), ghost "עריכת פרטים" / "החלפת משפחה" side by side, a quiet "התנתקות מהטלפון הזה" link (no family: the yellow "בחירת משפחה") · "שם הקבוצה" (with a family): hint "הקישור לקבוצה לא משתנה.", the name field (max 60) and a ghost "שמירת השם", enabled when the trimmed name is non-empty and changed → `PATCH { name }`, toast "שם הקבוצה עודכן"; the slug/URL never changes · "קישור לקבוצה": read-only link + "העתקה" (clipboard, toast "הקישור הועתק") and the green WhatsApp share · "קבוצת הוואטסאפ": a ghost "פתיחת קבוצת הוואטסאפ" (when set) and, for a device with a family, the link field (ghost save / red "הסרת הקישור" link; `PATCH`) · "מחיקת הקבוצה" (with a family; outline red button): `?sheet=delete-group` "כל המשפחות, האירועים והתמונות יימחקו לכולם.", a simple yes/no confirm: red "כן, למחוק" and "ביטול" (closes the sheet) → `DELETE`, the identity and `lastUsed` for the group are removed, replace to `/` with the toast "הקבוצה נמחקה". From the header gear (the identity chip opens `/g/:group/me`). |
| `/g/:group` | Group home: upcoming events sorted by date (date block, title, mini gap meters per leg, a chip per kid of mine: "נועה: הלוך ✓ · חזור ?" with ✓ seated, ? needs a ride, – not needed / not coming), "+ אירוע חדש". Past events sit under a collapsed `<details>` "אירועים שעברו" for 30 days after their date, then drop off the list (the server omits them; data and direct links stay; `shownOnGroupHome` in `shared/dates.ts`, Israel dates). Cancelled events stay in place, greyed, with a "בוטל" tag. A "הקבוצות שלי" link above the title (→ `/`); "פתיחת קבוצת הוואטסאפ" next to the invite link when the group has a `whatsappUrl`. |
| `/g/:group/new` | Create event. The form shows right away; above it, an optional slim drop zone for the invitation image (pick, drop or paste) that uploads it as the cover and prefills the form. |
| `/g/:group/e/:event` | Event, tab **הילדים שלי**: RSVP for my kids (3 toggles each; with rsvp yes and a kid phone, a "שליחה ל{kid}" WhatsApp button to the kid: event, one line per leg, the per-event kid link; without a phone, "+ הוספת טלפון ל{kid}" → `/g/:group/me?focus=kid-<id>-phone`) + history. |
| `/g/:group/e/:event/out`, `/back` | Tabs **הלוך** / **חזור**: the **board** for that leg: waiting kids chips, car cards with seat slots, "+ אני נוהג/ת". |
| `/g/:group/e/:event/invite` | Invitation image full screen. |
| `/g/:group/e/:event/drive/:leg` | Driver mode: "בדקו שעת יציאה" + "אישור שעה" when flagged, "יצאתי" (disabled while cancelled), "שיתוף עם הנוסעים" (per kid in the car: WhatsApp with the per-event kid link to the kid's own phone only; no phone → "+ הוספת טלפון" for my own kid, else "אין טלפון"; highlighted and scrolled to after "יצאתי"), pickup checklist in pickup order with "הגעתי" (`setArrived`) and "עלה/תה" per stop, call/WhatsApp ("אני למטה") per kid/parent, Maps/Waze links. |
| `/g/:group/me` | Family profile: parents + phones, address, kids (+ optional phones, kid links: sent only to a kid with a phone), cars (seats, color, plate, photo). `?focus=kid-<kidId>-phone` scrolls to and focuses that kid's phone field. Reached from the identity chip, the "המשפחה שלי" link at the bottom of the group home and settings' "עריכת פרטים". A small muted line on top, "לא אתם? החלפת משפחה", goes to "מי אתם?" (next = the group home). |
| `/g/:group/kid/:kidId` | Kid view, permanent link (read-only, never asks "מי אתם?"): the next upcoming rides; per leg a big live status, who picks me up, when, car photo, call driver, "אני מוכן/ה". Old `/kid/:group/:token` links redirect here. |
| `/g/:group/kid/:kidId/e/:event` | Kid view focused on one event (both legs, any date), same live status. Shared from the event page and driver mode. |

**Kid live status** (`kidLegStatus` in `shared/view.ts`, per leg the kid needs): `waiting` (no car) → `assigned` (driver, time, car photo) → `onTheWay` (run started) → `next` (run started and every earlier stop in the pickup order is picked; `KidRide.ahead === 0`) → `arrived` (driver tapped "הגעתי" at this kid's stop) → `picked` → `done`. `done` once the leg is over (`legOver`: 30 min after the start for out, 90 min after the return time for back, on the client's local clock), except while a started run hasn't picked the kid yet. Pickup order (`pickupStops`, also used by driver mode): out = one stop per family in seating order; back = one stop (everyone boards at the venue). Both kid pages subscribe to the group WebSocket and refetch on event updates.

**Event tabs** (`src/screens/EventFrame.tsx`, shared by the three tab routes): the event header (cover, title, date, times, place) with a **⋯** button (SVG icon) → `?sheet=menu`: "עריכת פרטים" (→ `?sheet=edit`, a full-screen form: title, date, start, return time, place, address, cover replace/remove; save sends `editEvent` + undo toast; back closes without saving), "שיתוף לקבוצה" (the group summary WhatsApp; the cancellation text when cancelled), "ביטול אירוע" (→ `?sheet=cancel` confirm → `cancelEvent`) or "שחזור" (`restoreEvent`). The menu swaps to the next sheet with a replace, so back closes it. Below the header: a cancelled note ("האירוע בוטל", ride controls disabled, everything greyed) or the **"עודכן" banner** (the newest not-undone `editEvent` log entry from the last 48 h that changed date/start/return time: "השעה השתנתה מ-X ל-Y" etc., a "שתף עדכון לקבוצה" WhatsApp, dismissible per device in localStorage `trempush.dismissedUpdates`), then the tab bar "הילדים שלי | הלוך | חזור". Each leg tab shows a dot for its gap state (missing / unassigned / ok / none). Switching tabs (tap or horizontal swipe, RTL: finger right = next tab; swipes starting within 24 px of a screen edge are ignored) is a route **replace** that keeps the entry's history state, so tabs don't pile up history and back leaves the event. The in-app back arrow always goes up (see **Navigation up** below).

**Group name visible**: the group home title is the group name; the identity chip reads "פועל/ת בתור: משפחת X · <group name>" on every group screen with a chip; event tabs, boards, driver mode, the invite screen, settings, profile and new event show the group name as a small muted line above the title that links to `/g/:group`; the kid page shows it under the greeting.

**Navigation up** (`useBack` in `src/nav.ts`): the header back arrow never depends on browser back. It always goes to the screen's parent: board / drive / invite / leg tabs → event הילדים שלי; event הילדים שלי, profile, settings, new event → group home (who → group home when this phone has a family there, else `/`); group home → `/`. The kid page has no arrow. When the previous in-app entry (`prev` in the history state) is exactly the parent it steps back (`history.back()`); otherwise it replaces the current entry with the parent, so the browser's back still returns to whatever was behind.

**Deleted group**: on `{ t: "deleted" }` from the group WebSocket, or a 404 on `GET /api/g/:group` for a group this phone has a family in, the client forgets the group (identity, `lastUsed`, "רק להסתכל") and every route of that group (`/g/:group/…`, `/join/:group`) shows "הקבוצה נמחקה" with "לקבוצות שלי" (`src/screens/GroupGone.tsx`) for the rest of the page view. All from the cached group (`useGroup`), never blocking render.

Every `/g/:group/…` route except `who` and `kid`, and `/join/:group`, sends a device with no family for that group (and not in "רק להסתכל" mode) to `/g/:group/who?next=<original URL>` (a replace, so back doesn't bounce).

Slugs (`shared/slug.ts`): lowercase a-z, 0-9 and hyphen, 3–40 chars, no leading/trailing hyphen.
- `:group` is chosen at creation (English URL name, prefilled from Latin letters/digits in the name, else `group-<4 random>`, replaced by the Workers AI suggestion when one arrives). Groups created before slugs keep their random 10-char id, which is also a valid slug.
- `:event` is generated by the DO: `<mon>-<day>` from the date (`oct-16`), plus the optional English word from the form (`oct-16-birthday`), `-2`/`-3` on a clash. Immutable: editing the date keeps it.
- `:kidId` is the kid's short id. Families have no slugs.

Sheets use `?sheet=<name>` (pushState), so back closes the sheet. Examples: `menu` (the event ⋯ menu), `car` (offer a car), `feedback` (the in-app feedback sheet, opened from the floating "משוב" button on every screen, kid page included). Opening or closing a sheet only adds/removes `sheet` and its own params (`fam`, `kid`, `offer`); the screen's query (e.g. `/join/:group?new=1&next=…`) is kept, so route guards and redirects never see a change and form input survives.

Scroll position is restored per history entry. Never use `replaceState` for real navigation.

Transient screens never stay in history: the "מי אתם?" redirect, who ↔ registration links, and leaving who/registration (after choosing, registering or "רק להסתכל") all replace the current entry, or step back when the target is the entry we came from (`useLeave` in `src/nav.ts`). A replaced entry keeps the replaced entry's `prev`, so the header back arrow only walks history when there really is an in-app entry behind; otherwise it replaces the entry with its parent (invite → event → group → my groups). The family guard redirects only when this phone has no stored family id for the group and is not browsing; it never waits for the group to load.

New event (manual form): the date starts empty and is required; a date before today is rejected in the form (the API still accepts past dates for edits). Choosing a future date fills 10:00–12:00 when no times are set; today or no date leaves the times empty.

## 3. API contract (Worker → GroupDO)

Rules for every call:
- JSON in, JSON out. Errors: `{ error: ErrorCode }` with an HTTP status. `ErrorCode` is an English enum, and the UI maps it to Hebrew.
- Identity: header `X-Family-Id: <familyId>`. The server only checks that the family exists in the group (unknown → 403 `forbidden`). There is no secret.
- **Trust model:** anyone with the group link can act as any family; guardrails (identity chip, confirmations for destructive writes, undo, the permission rules below) prevent mistakes, not malice. Don't store sensitive data.
- `whatsappUrl` (`normalizeWaGroupUrl` in `shared/whatsapp.ts`): `https://chat.whatsapp.com/<code>`, code `[A-Za-z0-9]{10,40}`; also accepted without `https://` and with a trailing `?…`, stored normalized to the bare https URL.
- `:group` is the group slug; the Worker addresses the DO with `idFromName(slug)`. `/api/g/:group/__*` paths are internal (Worker → DO) and 404 from outside.

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /api/config` | – | → `{ features: { places: bool, routes: bool, inviteParse: bool, slugSuggest: bool } }` (`slugSuggest` = the Workers AI binding `AI` exists) |
| `POST /api/groups` | – | `{ name, slug, whatsappUrl? }` → `{ groupId: slug }` · 400 `invalid` (bad slug or bad `whatsappUrl`) · 409 `{ error: "slug_taken", suggestion: "slug-2" }` ("taken" = that DO already has `meta`). No `slug` → a random 10-char one. |
| `POST /api/groups/suggest-slug` | – | `{ name }` (≤ 60 chars) → `{ slug?: string }` · 400 `invalid` (empty name). Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (JSON mode, prompt in `shared/slugSuggest.ts`) turns the name into 1–4 English words (`בר מצווה לתומר` → `tomer-bar-mitzvah`); the reply is `slugify`'d (≤ 30 chars), must pass `isSlug`, and is made free (`slug`, `slug-2`… up to 6). Any failure (no `AI` binding, model error, junk, 4 s timeout, nothing free) → `{}` with 200. |
| `GET /api/g/:group` | optional | → `{ group, families: FamilyPublic[] (incl. phones, address), events: EventSummary[], me?: FamilyPrivate }` |
| `PATCH /api/g/:group` | ✓ | `{ name?, whatsappUrl? }` (at least one) → `{ group: GroupMeta }` · `whatsappUrl: ""` clears it · 400 `invalid`. Bumps the group version and broadcasts `{ t: "group" }`. |
| `DELETE /api/g/:group` | ✓ | → `{ ok: true }`. Any family (trust model). The DO broadcasts `{ t: "deleted" }`, closes the sockets, deletes the group's R2 images (`list({ prefix: "img/<slug>/" })` + batched `delete`), then `ctx.storage.deleteAll()` (families, events, log, DO-stored images, meta). Afterwards every call for the group is 404 `not_found` (checked before `X-Family-Id`) and `POST /api/groups` can reuse the slug. |
| `POST /api/g/:group/families` | – | `FamilyInput` → `{ familyId }` (stored on the device) · 400 `invalid` when the family, a parent or a kid name is blank after trimming, longer than 40, or the literal "undefined"/"null" (any case; only ever a bug stringifying a missing value) |
| `PUT /api/g/:group/families/me` | ✓ | `FamilyInput` → `{ me: FamilyPrivate }` · same name rules as registration |
| `POST /api/g/:group/events` | ✓ | `EventInput & { slugWord? }` → `{ eventId }` (the event slug) · 400 when `slugWord` has no Latin letters/digits |
| `GET /api/g/:group/events/:event` | optional | → `EventView` (seats, kids, everyone's phones and addresses, log tail, `me`) |
| `POST /api/g/:group/events/:event/actions` | ✓ | `Action` → `{ event: EventView, logId }` · 403 `forbidden` · 409 `seat_taken` / `car_full` / `stale` · 400 `invalid` |
| `POST /api/g/:group/events/:event/undo` | ✓ | `{ logId }` → `{ event: EventView }` (only your own action, ≤ 2 min old; recorded as a compensating log entry) |
| `GET /api/g/:group/ws` | – | WebSocket upgrade. The server sends `{ t: "event", eventId, version }` / `{ t: "group", version }` after each change, and `{ t: "deleted" }` when the group is deleted. |
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
| `editEvent { patch }` | Any family. `patch` ⊆ title, date, start, returnTime, place, address, coverImageId (`null` removes); validated like `EventInput`; unchanged fields are ignored and an empty change is `invalid`. The slug never changes. The log stores only the changed fields plus `prev` (their old values; `loggedAction`). A changed date or start flags every out-leg offer `departAtCheck`; a changed date or returnTime flags every back-leg offer. Undo restores fields and flags. |
| `cancelEvent` / `restoreEvent` | Any family; `invalid` when already in that state. Stored as `EventState.cancelled: true` (absent when live). While cancelled, `setKidPlan`, `offerCar`, `updateOffer`, `removeOffer`, `seatKid`, `unseatKid`, `startRun`, `setPicked`, `setArrived`, `setKidReady` and `confirmDeparture` fail with `event_cancelled` (409); editing and undo still work. |
| `confirmDeparture { offerId }` | Offer owner ("אישור שעה"); `invalid` when not flagged. Clears `departAtCheck`; so does `updateOffer` with `departAt`. Inverse: system `setDepartAtCheck`. |

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

Families are identified by id; names may collide. `familyLabel(family, all)` returns the parts and `he.familyLabel` formats them: "משפחת כהן" when unique; otherwise, each step only while still colliding: first 2 kid names → + a parent's first name → + street (address text before the first digit/comma) → an ordinal by creation order ("משפחת כהן 2"). A stored name that is missing, blank, "undefined" or "null" (legacy/corrupt data) never shows: `familyDisplayName` falls back to the first parent's first name, then "?"; the family page (`/g/:group/me`) shows that name field empty with the required-field error, so saving needs a real name. Used by the identity chip, car cards, log lines, the WhatsApp summary, settings and the picker.

## 4. Storage inside GroupDO (SQLite-backed, KV API: `ctx.storage.get/put`)

```
meta                 { id (= group slug), name, createdAt, version, whatsappUrl? }
family:{id}          Family (kids[{id,name,phone?}], cars[{id,label,seats,color?,plate?,photoId?}])
event:{slug}         EventState (materialized; version; `id` = slug; `cancelled?: true`; offers may carry `departAtCheck?: true`)
log:{eventSlug}:{seq} LogEntry (append-only, zero-padded seq)
img:{id}             { mime, bytes: ArrayBuffer, createdAt }
```

Older stored families may still carry `keyHash` / `kidToken`; they are ignored (stripped from responses), and old kid tokens are still accepted on the kid API.

```
```

Feedback storage: with the R2 binding `IMAGES`, records go to `feedback/{yyyy-mm-dd}/{id}.json`, audio to `feedback-audio/{id}`, screenshots to `feedback-shots/{id}`. Without R2 the same keys live in a dedicated GroupDO instance (`idFromName("__feedback__")`, keys prefixed `fb:`; blobs split into 1 MB chunks).

## 5. UX rules (from the workshop — non-negotiable)

- **Mobile-first, RTL, Hebrew.** Big tap targets.
- **One action per screen.** The identity chip "פועל/ת בתור: משפחת X" is always visible, in the family color, and opens the family page "המשפחה שלי" (which offers "לא אתם? החלפת משפחה"); the header gear opens settings (sign out).
- **Seating and unseating act on tap** (no confirmation sheet; a second tap while the request is in flight is ignored): tap a waiting kid then an empty seat (or "אני לוקח/ת") to seat, tap a seated kid to take them off. Destructive or broad writes (cancel event, remove offer, delete group) still confirm. After any write, a 10 s undo toast.
- **Gap meter per leg**, in three states:
  - "חסרים N מקומות" (amber)
  - "יש מקום לכולם · N ממתינים לשיבוץ"
  - "כולם מסודרים ✓" (green)
- **WhatsApp**: buttons open `https://wa.me/<972…>?text=` (to a person) or `https://wa.me/?text=` (group chooser; the linked `whatsappUrl` is only an "open the group" link, never used for sending).
  - Texts come from `i18n/he.ts` templates: short (2–4 lines, the link alone on the last line, at most one emoji); the group summary has one line per leg ("הלוך 09:30: לוי (מאיה, נועה) · חסר מקום אחד").
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
- `ErrorCode` also has `event_cancelled` (409, ride action on a cancelled event). System action `setDepartAtCheck { offerId, check }` (inverse only).
- `EventSummary` carries `cancelled?`, `kidPlans` and `seated: { out, back }` (kid ids) for the group home chip; `EventView` / `KidEventView` carry `cancelled?`.
- Offer limits (second offer per leg, seats below seated / above car) → `invalid`; kid already on that leg → `seat_taken`. `stale` (version mismatch) is the DO's job.
- `shared/validate.ts`: `validateFamilyInput`, `validateEventInput`, `buildFamily`, `createEventState`. `shared/index.ts` re-exports all.
- `bun run typecheck` runs `tsc` per tsconfig (TS 7 + reference-only root checks nothing).
- Dev: after stopping `bun run dev`, vite/workerd may linger — kill them by PID.
- Images: behind an `ImageStore` interface. **R2 bucket `trempush-images` is enabled** (binding `IMAGES`); removing the binding falls back to the group DO.
