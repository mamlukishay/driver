# Carpool app ("טרמפ" working name) — architecture workshop spec

Source of truth for the workshop artifact. Written by the architect; the artifact builder turns it into the page.
Do not include any real names / content from the source chat. All sample data is invented.

## 1. What the source chat taught us (anonymized patterns → requirements)

| Pattern seen in a real parents' group | Requirement |
|---|---|
| Host posts an invite + an RSVP poll (coming / not coming) | Event has RSVP per kid, separate from rides |
| "Can my kid join someone in the morning, and I'll bring them back?" | **Legs are independent**: a kid can need a ride on the way there only, back only, or both |
| "I think we need two drivers, I prefer to bring back" | Drivers offer **one leg or both**; app shows **how many seats are missing per leg** |
| "I'll take one side" → then lists 4 kids by name | Driver offer = car + seats + leg; kids are seated into it |
| "Me and my kid are abroad, thanks" | Kid status "not coming" removes them from the need |
| "Is anyone else able to drive?" / "Do we still need rides?" | A **gap meter**: "חסרים 3 מקומות בהלוך" + one-tap "ask the group on WhatsApp" |
| "We can drive too" (a neighbor / non-class family) | Anyone in the group can offer a car |
| "Tal, please register my kid with you" | **Parent A seats their own kid in Parent B's car.** Must be safe and visible to B |
| Event has 2 locations/times (ceremony 10:30, meal 12:30, same address) | Event: place, start time, **return pickup time** (default = end time) |

Personas: **Parent** (registers family, RSVPs kids, offers rides, drives) and **Kid** (sees "who picks me up, when, which car", taps "I'm ready").

## 2. Fixed constraints from the user
- Hebrew, RTL, mobile-first, nice looking but SIMPLE.
- No real sign-in, but built so people don't act on behalf of another family by mistake.
- One-time family registration ("מנוי"): parent name, phone, address, kids, vehicles (seat counts).
- Events are one-offs with two legs (הלוך / חזור). Recurring = later/advanced.
- Signup + the carpool itself must be dead easy.
- Notifications: WhatsApp if feasible; else creative alternatives.
- Every page has its own URL; browser back/forward & iOS swipe-back must work perfectly.
- Netlify free tier. Avoid a DB if possible (KISS).

## 3. Shared foundation (same in all 3 alternatives)

### Stack
- Static SPA built with Vite + Preact (tiny, React-like) + plain CSS tokens. `dir="rtl" lang="he"`.
- Routing with the History API (real paths, not hashes). Netlify `_redirects`: `/*  /index.html  200`.
- Back/forward rules: every screen = a URL; bottom sheets that matter (seat picker) push `?sheet=seat` so swipe-back closes the sheet instead of leaving the page; scroll position restored per route; no `replaceState` abuse; forms never trap navigation.
- Data: **Netlify Functions + Netlify Blobs** (key-value JSON files built into Netlify). No external DB service, no account to create, free tier. Writes use ETag conditional writes (optimistic concurrency) so two parents tapping at once don't overwrite each other — on conflict the function re-reads, re-applies the action, retries.
- Polling every ~15s while an event page is open (+ on focus). No websockets needed.

### URL map
```
/                         → my groups / landing
/join/:groupCode          → invite link from WhatsApp → registration if new device
/g/:group                 → group home: upcoming events
/g/:group/new             → create event
/g/:group/e/:event        → event page (summary + both legs)
/g/:group/e/:event/out    → leg: הלוך
/g/:group/e/:event/back   → leg: חזור
/g/:group/e/:event/drive/:leg → driver run mode (pickup checklist)
/kid/:kidToken            → kid's read-only "my rides" page
/me                       → my family profile (kids, cars, phone, address)
/me/devices               → "move to another phone" link
```

### Identity without sign-in ("guardrails, not passwords")
- Registration creates a **family** + a random **family key** (secret). Stored in localStorage; server keeps only its hash. Every write sends the key; the function checks permissions.
- **"פועל/ת בתור" chip**: a permanent, colored chip in the header — "משפחת כהן". Family color + avatar used everywhere the family appears, so "me" is visually obvious.
- **Permissions**: you can change only your own family (kids, RSVPs, cars). You may seat **your own kid** into **any free seat** someone offered (that's the "register my kid with you" pattern) — the driver sees it immediately with the parent's name + gets a WhatsApp-ready message. Only the driver can remove kids from their car or close it. Nobody can edit another family's kid.
- **Mistake-proofing**: every write is a sentence confirmation ("להושיב את נועה ברכב של משפחת לוי — הלוך, 10:00?"), a 10-second **undo** toast, and an event **history** ("שירה הושיבה את נועה ברכב של לוי · 08:42").
- **Second device / second parent**: "send me my link" → opens WhatsApp to yourself with `/me/devices#key…`-style magic link (key in fragment so it never hits server logs). Second parent can be invited as a member of the same family.
- **Kid link**: each kid gets a read-only token URL — safe to put on a kid's phone.

### Notifications baseline (works in all alternatives, zero cost)
- **WhatsApp click-to-send**: app composes Hebrew text and opens `wa.me/<phone>?text=…` (to a parent) or `wa.me/?text=…` (chooser → pick the group). The human taps Send. Free, no API, no approval. Limitation: the user must tap, and a message can't be pre-targeted at a group.
- **Group summary**: "שתף סיכום לקבוצה" builds one tidy message: legs, drivers, kids per car, pickup times, missing seats.
- Navigation deep links: Google Maps multi-stop route (all pickups in order) / Waze to next stop.
- Add-to-calendar (.ics) for drivers.

### Data model (JSON in Blobs)
```
group/{groupId}.json   { name, inviteCode, families:[…], createdAt }
family: { id, color, parents:[{name, phone}], address, kids:[{id,name,grade?}], cars:[{id,label,seats}] , keyHash }
event/{groupId}/{eventId}.json
  { id, title, place, address, date, start, returnTime, hostFamilyId,
    rsvp: { kidId: "yes"|"no"|"maybe" },
    needs: { kidId: { out: bool, back: bool } },
    legs: { out: { cars:[Offer] }, back: { cars:[Offer] } },
    log: [ { at, familyId, action, … } ] }
Offer: { id, familyId, carId, seats, departAt, kids:[kidId], status:"open"|"full"|"closed", run?: {startedAt, picked:[kidId]} }
```

## 4. The three alternatives

### A — "הלוח" (The Board) — manual, visual, smallest
**Idea**: The event page *is* a seating board. Two tabs (הלוך / חזור). On top: "ממתינים להסעה" — chips of kids who need a ride on this leg. Below: cars as cards with seat slots (filled = kid avatar, empty = dashed seat). Tap a kid chip → tap an empty seat. Driver taps "+ אני נוהג/ת" → seats prefilled from profile.
- **Signup flow**: open event from WhatsApp link → my kids listed with 3 toggles each: מגיע/ה · צריך/ה הלוך · צריך/ה חזור → done. 1 screen.
- **Driver flow**: "+ אני נוהג/ת בהלוך" → choose car (seats prefilled) → departure time → done. Then drag/tap kids or let parents fill.
- **Gap meter**: per leg "חסרים 3 מקומות" (needs − seats) in amber; green "כולם מסודרים ✓".
- **Day-of**: driver taps "יצאתי" → app shows a list of the parents in the car, each a WhatsApp button with prefilled "יצאתי, אגיע בעוד ~10 דק׳". Kids page shows "בדרך אליך".
- **Notifications**: WhatsApp click-to-send only. In-app status on refresh.
- **Recurring**: "שכפל אירוע" (duplicate to another date). True recurrence later.
- **Tech**: SPA + 3 functions (`group`, `event`, `action`) + Blobs. ~1 store, no cron.
- **Effort**: S. **Pros**: simplest mental model, mirrors the chat, transparent, fully free. **Cons**: someone must do the seating; notifications need a tap.

### B — "הסדרן" (The Dispatcher) — the app plans the rides
**Idea**: Parents only answer questions; the app proposes the seating. RSVP card stack per event: "נועה מגיעה?" → "צריכה הלוך? חזור?" → "את/ה יכול/ה להסיע? הלוך/חזור · כמה מקומות". When enough answers exist, the app builds a **suggested plan** (greedy: cluster kids by home proximity, fill drivers' seats, respect who-wants-which-leg, fairness score) and shows it as "הצעת שיבוץ". The host (or any driver) taps "אשר ושלח".
- **Signup flow**: 3 questions, card-stack, 20 seconds.
- **Driver flow**: just says "I can drive back, 4 seats"; gets assigned kids + an ordered pickup route with estimated times.
- **Gap meter**: "חסר נהג אחד להלוך" + button "בקש מהקבוצה" (WhatsApp share with a deep link that opens directly to "I can drive" question).
- **Fairness**: per-family counter "הסעת 3 פעמים החודש" — app prefers families who drove less.
- **Notifications**: **Web Push** (installed PWA; iOS 16.4+ needs Add to Home Screen) + **Netlify Scheduled Function** for reminders: evening before ("מחר את/ה מסיע/ה 3 ילדים, יציאה 10:00"), 30 min before. "יצאתי" → push to every passenger's parent automatically. WhatsApp click-to-send as fallback for non-installers.
- **Recurring**: weekly templates (חוג כל יום ג׳) with rotation — natural fit because the dispatcher already balances turns.
- **Tech**: SPA + functions + Blobs + scheduled function (cron) + VAPID keys + `web-push` + push subscriptions stored per family. Geocoding addresses once at registration (OSM Nominatim) for proximity.
- **Effort**: M–L. **Pros**: least work for parents, fair, automatic reminders. **Cons**: "why did the app put my kid there?", PWA install friction on iPhone, more moving parts, geocoding quality on Hebrew addresses.

### C — "הלוח הפתוח" / "בקשות והצעות" (Requests & Offers feed) — mirrors the WhatsApp behavior
**Idea**: The event page is a **feed** that looks like the chat parents already use, but structured. Two kinds of cards: **בקשה** ("נועה צריכה הלוך") and **הצעה** ("יש לי 3 מקומות בחזור, יציאה 13:30"). Every card has one big action: on a request → "אני לוקח/ת"; on an offer → "תושיב/י את נועה". Matched cards collapse into "סגור ✓". A sticky header shows the gap meter for both legs.
- **Signup flow**: tap kid → "צריך/ה הלוך / חזור / שניהם / מסתדרים" → a request card appears.
- **Driver flow**: tap "אני יכול/ה להסיע" → leg + seats → an offer card. Or tap "אני לוקח/ת" on someone's request.
- **Tech twist — append-only log**: every action is its own blob (`event/{id}/log/{timestamp}-{rand}`); state = replay of the log. No write conflicts at all (no two writers touch the same key), full audit trail, undo = compensating action. Great for the "people make mistakes / act for others" concern.
- **Notifications**: WhatsApp click-to-send, plus an **automatic** option: a **Telegram bot** or **ntfy** topic per family (free, real push, no PWA install) — opt-in for families who want automatic "driver left" alerts. "Driver run mode": step through stops, "הגעתי לנועה" → one tap sends that parent "אני למטה 🚗".
- **Recurring**: "חזור על הבקשה כל שבוע" on a request card (per-kid recurring needs) — later.
- **Effort**: M. **Pros**: zero learning curve (it *is* the chat, but tidy), no conflicts, audit trail. **Cons**: feed can get long for big events; seating overview is less spatial than A; Telegram/ntfy is a second app for parents.

## 5. Comparison (for the table)
| | A הלוח | B הסדרן | C בקשות והצעות |
|---|---|---|---|
| Parent effort | Low | Lowest | Low |
| Organizer effort | Medium (seating) | Lowest | Low |
| Learning curve | Low | Medium (trust in algorithm) | Lowest |
| Automatic notifications | No (tap-to-send) | Yes (Web Push + cron) | Optional (Telegram/ntfy) |
| Backend pieces | 3 functions + Blobs | functions + Blobs + cron + push keys + geocoding | functions + Blobs (log) |
| Concurrency | ETag retry | ETag retry | none needed (append-only) |
| Recurring | duplicate | weekly rotation | per-request repeat |
| Build effort | S | M–L | M |
| Netlify free | ✓ | ✓ (watch function credits) | ✓ |

## 6. Architect's recommendation
Build **A as v1**, steal two things from C: the **append-only action log** (no conflicts + history + undo) and the one-tap **"אני לוקח/ת"** quick actions on waiting kids. Notifications in v1 = WhatsApp click-to-send + driver run mode. **v2**: B's scheduled reminders + Web Push for families who install the PWA, then recurring events with rotation.

## 7. Roadmap
- v1 (MVP): register family, group invite link, create event, RSVP + leg needs, offer car, seat kids, gap meter, WhatsApp summary/“יצאתי”, kid link, history+undo.
- v1.1: driver run mode with Maps/Waze route, .ics, duplicate event.
- v2: PWA push + scheduled reminders, recurring events with rotation, fairness counter.
- v3 (maybe): auto-suggested seating (B's dispatcher) as an optional "הצע שיבוץ" button.

## 8. Open questions for the user (to show at end of artifact)
1. One group per class/team, or a parent can be in many groups (likely many)? → design supports many.
2. Who can create events — anyone in the group, or the host only? (default: anyone)
3. Car seats — count seats excluding the driver, and do we need booster/age constraints? (default: count only)
4. Is a "maybe" RSVP needed, or only yes/no?
5. WhatsApp-only, or OK to offer Telegram/Push opt-in for automatic alerts?

## 9. Verified-ish facts (research pass, Oct 2026 — some primary docs were unreachable; treat as "check before build")
- **Netlify free** = 300 credits/month (credit-based since 2025). Functions & scheduled functions available on free, billed per compute GB-hour — a class-size app uses a tiny fraction. Blobs included on free. SPA fallback `/* /index.html 200` still standard.
- **Netlify Blobs** (`@netlify/blobs`): conditional writes `onlyIfMatch` (ETag) / `onlyIfNew`; consistency eventual by default, `consistency: "strong"` per store/read; `list({prefix})` supported. → our concurrency plan works.
- **WhatsApp**: `wa.me/<number>?text=` prefills to a person ✓. Cannot target a group via link — `wa.me/?text=` opens a chooser ✓. **Cloud API**: Meta Business account + dedicated number + approved templates, per-message pricing (and Meta started charging for more categories from Oct 2026); group sending restricted to eligible businesses → **not for this app**. CallMeBot = only messages yourself; unofficial libs (Baileys, whatsapp-web.js) violate ToS + need an always-on server → **avoid**.
- **Web Push on iOS**: iOS 16.4+, only when added to Home Screen, permission from a tap. VAPID keys + `web-push` from a Netlify Function works.
- **Telegram bot**: free, real automatic push; user must /start the bot once. **ntfy.sh**: free public server, iOS/Android apps, unguessable topic = password.
- **Google Maps multi-stop URL**: plan for ≤ 8 intermediate stops. **Waze** deep link: single destination only → "navigate to next stop".
- **Nominatim** (B only): 1 req/s, cache, Hebrew house numbers spotty → fallback "share my location" pin.
- **.ics** download opens iOS "Add to Calendar" ✓; `navigator.share()` works on iOS Safari from a tap ✓.
