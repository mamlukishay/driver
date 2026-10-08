import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";
import type {
  Action,
  CreateEventResponse,
  EventState,
  Family,
  GroupMeta,
  GroupResponse,
  InviteParseRequest,
  Leg,
  LogEntry,
  RegisterFamilyResponse,
  WsMessage,
} from "../shared/types.ts";
import { FAMILY_ID_HEADER, LEGS, MAX_IMAGE_BYTES } from "../shared/types.ts";
import { applyAction, loggedAction, undo } from "../shared/actions.ts";
import { shownOnGroupHome } from "../shared/dates.ts";
import type { ActionCtx } from "../shared/actions.ts";
import { withParentIds } from "../shared/drivers.ts";
import { eventSummary, familyPrivate, familyPublic, kidView, LOG_TAIL, viewFor } from "../shared/view.ts";
import {
  buildFamily,
  cleanText,
  createEventState,
  validateEventInput,
  validateFamilyInput,
} from "../shared/validate.ts";
import { isId, newId } from "../shared/ids.ts";
import { eventSlugBase, firstFreeSlug, isKidSlug, isSlug, slugify } from "../shared/slug.ts";
import { kidSlugClash, resolveKid, takenKidKeys } from "../shared/kidSlug.ts";
import { normalizeWaGroupUrl } from "../shared/whatsapp.ts";
import { ApiError, errorResponse, isObj, json, readJson } from "./http.ts";
import { createImageStore, IMAGE_MIMES } from "./images.ts";
import { DEFAULT_INVITE_MODEL, parseInvite, parseInviteWithWorkersAI } from "./invite.ts";
import { placesAutocomplete } from "./google.ts";
import { aiSlugSuggestion } from "./slug-suggest.ts";

const FAMILY_COLORS = 5;
const MAX_FAMILIES = 100;
const SEQ_WIDTH = 8;

const pad = (n: number) => String(n).padStart(SEQ_WIDTH, "0");
const logKey = (eventId: string, seq: string) => `log:${eventId}:${seq}`;

/** `yyyy-mm-dd` in Israel. */
function todayIL(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

/** A kid link name already in use; the 409 names it so the form can mark the right field. */
class KidSlugTaken extends ApiError {
  constructor(readonly slug: string) {
    super("kid_slug_taken");
  }
}

/** One instance per group; the source of truth for its families, events, log and images. */
export class GroupDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (e) {
      if (e instanceof KidSlugTaken) return json({ error: "kid_slug_taken", slug: e.slug }, 409);
      if (e instanceof ApiError) return errorResponse(e.code);
      console.error("GroupDO error", e);
      return json({ error: "invalid" }, 500);
    }
  }

  /* ---------- routing ---------- */

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const seg = url.pathname.split("/").filter(Boolean); // api, g|kid, group, ...
    const m = request.method;

    if (seg[0] !== "api" || seg[1] !== "g") throw new ApiError("not_found");
    const rest = seg.slice(3);

    // Internal calls from the Worker (it refuses `__*` paths from outside).
    if (rest[0] === "__init" && rest.length === 1 && m === "POST") return this.init(request, seg[2]!);
    if (rest[0] === "__taken" && rest.length === 1 && m === "GET") return json({ taken: !!(await this.ctx.storage.get("meta")) });

    if (rest[0] === "kid") {
      const kid = rest[1];
      // A kid slug, an earlier slug, a kid id or a legacy token.
      if (!kid || kid.length > 64 || !/^[a-z0-9-]+$/.test(kid)) throw new ApiError("not_found");
      if (rest.length === 2 && m === "GET") return this.kidGet(kid, url.searchParams.get("event"));
      if (rest.length === 3 && rest[2] === "ready" && m === "POST") return this.kidReady(request, kid);
      throw new ApiError("not_found");
    }

    if (rest.length === 0 && m === "GET") return this.groupGet(request);
    if (rest.length === 0 && m === "PATCH") return this.groupPatch(request);
    if (rest.length === 0 && m === "DELETE") return this.groupDelete(request);
    if (rest[0] === "families" && rest.length === 1 && m === "POST") return this.registerFamily(request);
    if (rest[0] === "families" && rest[1] === "me" && rest.length === 2 && m === "PUT") return this.updateMe(request);
    if (rest[0] === "events") {
      if (rest.length === 1 && m === "POST") return this.createEvent(request);
      const id = rest[1];
      if (id && isSlug(id)) {
        if (rest.length === 2 && m === "GET") return this.eventGet(request, id);
        if (rest.length === 3 && rest[2] === "actions" && m === "POST") return this.eventAction(request, id);
        if (rest.length === 3 && rest[2] === "undo" && m === "POST") return this.eventUndo(request, id);
      }
      throw new ApiError("not_found");
    }
    if (rest[0] === "ws" && rest.length === 1 && m === "GET") return this.wsUpgrade(request);
    if (rest[0] === "images") {
      if (rest.length === 1 && m === "POST") return this.imagePost(request);
      if (rest.length === 2 && m === "GET" && isId(rest[1])) return this.imageGet(rest[1]);
      throw new ApiError("not_found");
    }
    if (rest[0] === "invite" && rest[1] === "parse" && rest.length === 2 && m === "POST") return this.inviteParse(request);
    if (rest[0] === "places" && rest.length === 1 && m === "GET") return this.places(request, url);
    if (rest[0] === "suggest-slug" && rest.length === 1 && m === "POST") return this.suggestSlug(request);
    throw new ApiError("not_found");
  }

  /* ---------- storage helpers ---------- */

  private async meta(): Promise<GroupMeta> {
    const meta = await this.ctx.storage.get<GroupMeta>("meta");
    if (!meta) throw new ApiError("not_found");
    return meta;
  }

  private async families(): Promise<Family[]> {
    return [...(await this.ctx.storage.list<Family>({ prefix: "family:" })).values()].map(withParentIds);
  }

  /** One stored family, people ids filled in for families stored before drivers (see `withParentIds`). */
  private async family(id: string): Promise<Family | undefined> {
    const f = await this.ctx.storage.get<Family>(`family:${id}`);
    return f && withParentIds(f);
  }

  private async events(): Promise<EventState[]> {
    return [...(await this.ctx.storage.list<EventState>({ prefix: "event:" })).values()];
  }

  private async event(id: string): Promise<EventState> {
    const state = await this.ctx.storage.get<EventState>(`event:${id}`);
    if (!state) throw new ApiError("not_found");
    return state;
  }

  private async logTail(eventId: string): Promise<LogEntry[]> {
    const rows = await this.ctx.storage.list<LogEntry>({ prefix: `log:${eventId}:`, reverse: true, limit: LOG_TAIL });
    return [...rows.values()].reverse();
  }

  /**
   * Which family the request acts as (`X-Family-Id`). Null when absent; 403 when it names no family
   * in this group. No secret: anyone with the group link may act as any family (guardrails, not auth).
   */
  private async authenticate(request: Request): Promise<Family | null> {
    // A missing (never created or deleted) group is 404 before any identity check, so a stale family id
    // for a deleted group reads as "group gone", not "unknown family".
    await this.meta();
    const header = request.headers.get(FAMILY_ID_HEADER);
    if (header === null || header === "") return null;
    const family = isId(header) ? await this.family(header) : undefined;
    if (!family) throw new ApiError("forbidden");
    return family;
  }

  private async requireFamily(request: Request): Promise<Family> {
    const family = await this.authenticate(request);
    if (!family) throw new ApiError("forbidden");
    return family;
  }

  private async bumpGroup(meta: GroupMeta): Promise<number> {
    meta.version += 1;
    await this.ctx.storage.put("meta", meta);
    return meta.version;
  }

  private broadcast(msg: WsMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* closed socket; the runtime drops it */
      }
    }
  }

  /* ---------- group ---------- */

  private async init(request: Request, id: string): Promise<Response> {
    if (await this.ctx.storage.get("meta")) throw new ApiError("slug_taken");
    const body = await readJson(request);
    const name = isObj(body) ? cleanText(body.name, 60) : null;
    if (!name) throw new ApiError("invalid");
    const meta: GroupMeta = { id, name, createdAt: Date.now(), version: 1 };
    // Already validated and normalized by the Worker; checked again so the DO never stores junk.
    const wa = isObj(body) && typeof body.whatsappUrl === "string" ? normalizeWaGroupUrl(body.whatsappUrl) : null;
    if (wa) meta.whatsappUrl = wa;
    await this.ctx.storage.put("meta", meta);
    return json({ ok: true });
  }

  /** `{ name?, whatsappUrl? }`; `whatsappUrl: ""` clears the link. Any family may edit (trust model). */
  private async groupPatch(request: Request): Promise<Response> {
    await this.requireFamily(request);
    const meta = await this.meta();
    const body = await readJson(request);
    if (!isObj(body) || (body.name === undefined && body.whatsappUrl === undefined)) throw new ApiError("invalid");
    if (body.name !== undefined) {
      const name = cleanText(body.name, 60);
      if (!name) throw new ApiError("invalid");
      meta.name = name;
    }
    if (body.whatsappUrl !== undefined) {
      const wa = typeof body.whatsappUrl === "string" ? normalizeWaGroupUrl(body.whatsappUrl) : null;
      if (wa === null) throw new ApiError("invalid");
      if (wa) meta.whatsappUrl = wa;
      else delete meta.whatsappUrl;
    }
    await this.bumpGroup(meta);
    this.broadcast({ t: "group", version: meta.version });
    return json({ group: meta });
  }

  /**
   * Deletes the whole group for everyone: tells open clients, removes its R2 images (`img/{slug}/…`),
   * then wipes this DO's storage (families, events, log, DO-stored images, meta). Without `meta` the slug
   * is free again for `POST /api/groups`.
   */
  private async groupDelete(request: Request): Promise<Response> {
    await this.requireFamily(request);
    const meta = await this.meta();
    this.broadcast({ t: "deleted" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "deleted");
      } catch {
        /* already closed */
      }
    }
    const bucket = this.env.IMAGES;
    if (bucket) {
      const prefix = `img/${meta.id}/`;
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor, limit: 1000 });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
    await this.ctx.storage.deleteAll();
    return json({ ok: true });
  }

  private async groupGet(request: Request): Promise<Response> {
    const me = await this.authenticate(request);
    const meta = await this.meta();
    const [families, events] = await Promise.all([this.families(), this.events()]);
    const today = todayIL();
    // Past events drop off the list 30 days after their date (the data and direct links stay).
    const summaries = events.filter((e) => shownOnGroupHome(e.date, today)).map(eventSummary);
    const key = (e: { date: string; start: string }) => e.date + e.start;
    const upcoming = summaries.filter((e) => e.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
    const past = summaries.filter((e) => e.date < today).sort((a, b) => key(b).localeCompare(key(a)));
    const res: GroupResponse = { group: meta, families: families.map(familyPublic), events: [...upcoming, ...past] };
    if (me) res.me = familyPrivate(families.find((f) => f.id === me.id) ?? me);
    return json(res);
  }

  /* ---------- families ---------- */

  private async registerFamily(request: Request): Promise<Response> {
    const input = validateFamilyInput(await readJson(request));
    if (!input.ok) throw new ApiError("invalid");

    const meta = await this.meta();
    const families = await this.families();
    if (families.length >= MAX_FAMILIES) throw new ApiError("invalid");
    const id = newId(8);
    const family = buildFamily(
      input.value,
      { id, color: families.length % FAMILY_COLORS, createdAt: Date.now() },
      null,
      { id: () => newId(8) },
    );
    this.assertKidSlugsFree(families, family);
    const writes: Record<string, unknown> = { [`family:${id}`]: family };
    meta.version += 1;
    writes.meta = meta;
    await this.ctx.storage.put(writes);
    this.broadcast({ t: "group", version: meta.version });
    const res: RegisterFamilyResponse = { familyId: id };
    return json(res);
  }

  private async updateMe(request: Request): Promise<Response> {
    const auth = await this.requireFamily(request);
    const input = validateFamilyInput(await readJson(request));
    if (!input.ok) throw new ApiError("invalid");

    const prev = await this.family(auth.id);
    if (!prev) throw new ApiError("forbidden");
    const meta = await this.meta();
    const family = buildFamily(
      input.value,
      { id: prev.id, color: prev.color, createdAt: prev.createdAt },
      prev,
      { id: () => newId(8) },
    );
    this.assertKidSlugsFree(await this.families(), family);
    const writes: Record<string, unknown> = { [`family:${prev.id}`]: family };
    meta.version += 1;
    writes.meta = meta;
    await this.ctx.storage.put(writes);
    this.broadcast({ t: "group", version: meta.version });
    return json({ me: familyPrivate(family) });
  }

  /** 409 `{ error: "kid_slug_taken", slug }` when one of `family`'s kid link names is another kid's (now or earlier). */
  private assertKidSlugsFree(families: readonly Family[], family: Family): void {
    const slug = kidSlugClash(families, family);
    if (slug) throw new KidSlugTaken(slug);
  }

  /* ---------- events ---------- */

  private async createEvent(request: Request): Promise<Response> {
    const family = await this.requireFamily(request);
    const body = await readJson(request);
    const input = validateEventInput(body);
    if (!input.ok) throw new ApiError("invalid");
    const rawWord = isObj(body) ? body.slugWord : undefined;
    if (rawWord !== undefined && rawWord !== null && typeof rawWord !== "string") throw new ApiError("invalid");
    const word = typeof rawWord === "string" ? rawWord.trim() : "";
    if (word && (word.length > 30 || !slugify(word, 20))) throw new ApiError("invalid");
    const meta = await this.meta();
    // The slug is the event's id: `oct-16[-word]`, `-2`, `-3`… on a clash. Immutable afterwards.
    const existing = new Set((await this.ctx.storage.list({ prefix: "event:" })).keys());
    const id = firstFreeSlug(eventSlugBase(input.value.date, word), (s) => existing.has(`event:${s}`));
    if (!id) throw new ApiError("invalid");
    const state = createEventState(input.value, { id, hostFamilyId: family.id, now: Date.now() });
    meta.version += 1;
    await this.ctx.storage.put({ [`event:${id}`]: state, meta });
    this.broadcast({ t: "group", version: meta.version });
    const res: CreateEventResponse = { eventId: id };
    return json(res);
  }

  private async eventGet(request: Request, id: string): Promise<Response> {
    const me = await this.authenticate(request);
    await this.meta();
    const state = await this.event(id);
    const [families, log] = await Promise.all([this.families(), this.logTail(id)]);
    return json(viewFor(state, families, me?.id ?? null, log));
  }

  private async eventAction(request: Request, eventId: string): Promise<Response> {
    const family = await this.requireFamily(request);
    const body = await readJson(request);
    if (!isObj(body)) throw new ApiError("invalid");
    const { expectedVersion, ...action } = body;
    if (expectedVersion !== undefined && !Number.isInteger(expectedVersion)) throw new ApiError("invalid");

    // Only storage awaits from here on: the DO's input gate keeps this read-modify-write atomic.
    const state = await this.event(eventId);
    if (expectedVersion !== undefined && expectedVersion !== state.version) throw new ApiError("stale");
    const families = await this.families();
    const ctx: ActionCtx = { families, newId: () => newId(8) };
    const now = Date.now();
    const result = applyAction(state, ctx, action as unknown as Action, family.id, now);
    if (!result.ok) throw new ApiError(result.error);

    const entry: LogEntry = {
      id: pad(result.state.version),
      eventId,
      at: now,
      familyId: family.id,
      action: loggedAction(action as unknown as Action, result.inverse),
      inverse: result.inverse,
    };
    await this.ctx.storage.put({ [`event:${eventId}`]: result.state, [logKey(eventId, entry.id)]: entry });
    this.broadcast({ t: "event", eventId, version: result.state.version });
    const log = await this.logTail(eventId);
    return json({ event: viewFor(result.state, families, family.id, log), logId: entry.id });
  }

  private async eventUndo(request: Request, eventId: string): Promise<Response> {
    const family = await this.requireFamily(request);
    const body = await readJson(request);
    if (!isObj(body) || typeof body.logId !== "string" || !/^\d{8}$/.test(body.logId)) throw new ApiError("invalid");
    const logId = body.logId;

    const state = await this.event(eventId);
    const entry = await this.ctx.storage.get<LogEntry>(logKey(eventId, logId));
    if (!entry) throw new ApiError("not_found");
    const families = await this.families();
    const now = Date.now();
    const result = undo(state, { families, newId: () => newId(8) }, entry, family.id, now);
    if (!result.ok) throw new ApiError(result.error);

    const comp: LogEntry = {
      id: pad(result.state.version),
      eventId,
      at: now,
      familyId: family.id,
      action: { type: "undo", logId },
      inverse: result.inverse,
    };
    await this.ctx.storage.put({
      [`event:${eventId}`]: result.state,
      [logKey(eventId, comp.id)]: comp,
      [logKey(eventId, logId)]: { ...entry, undoneBy: comp.id },
    });
    this.broadcast({ t: "event", eventId, version: result.state.version });
    const log = await this.logTail(eventId);
    return json({ event: viewFor(result.state, families, family.id, log) });
  }

  /* ---------- kid ---------- */

  /**
   * Finds a kid by its link name, an earlier link name, its id, or (links sent before kid ids were used)
   * a legacy `kidToken` that older stored families still have; in that order (`resolveKid`).
   */
  private async kidFamily(kidParam: string): Promise<{ family: Family; kidId: string }> {
    const hit = resolveKid(await this.families(), kidParam);
    if (!hit) throw new ApiError("not_found");
    return { family: hit.family, kidId: hit.kid.id };
  }

  /** `?event=<slug>` focuses the view on that one event (any date); 404 when it doesn't exist. */
  private async kidGet(kidParam: string, eventParam: string | null): Promise<Response> {
    const meta = await this.meta();
    const { kidId } = await this.kidFamily(kidParam);
    if (eventParam !== null && !isSlug(eventParam)) throw new ApiError("not_found");
    const [families, events] = await Promise.all([this.families(), this.events()]);
    if (eventParam !== null && !events.some((e) => e.id === eventParam)) throw new ApiError("not_found");
    const view = kidView(meta, families, events, kidId, todayIL(), eventParam ?? undefined);
    if (!view) throw new ApiError("not_found");
    return json(view);
  }

  /**
   * "אני מוכן/ה": marks the kid ready on the next ride they are seated in
   * (earliest upcoming event, outbound before return, skipping rides already picked up).
   * Optional body `{ ready?: boolean (default true), event?: slug }`; with `event`, only rides in that
   * event (any date) are considered.
   */
  private async kidReady(request: Request, kidParam: string): Promise<Response> {
    const body = await readJson(request, true);
    const ready = isObj(body) && typeof body.ready === "boolean" ? body.ready : true;
    const only = isObj(body) && typeof body.event === "string" ? body.event : null;
    if (only !== null && !isSlug(only)) throw new ApiError("invalid");
    await this.meta();
    const { family, kidId } = await this.kidFamily(kidParam);
    const row = { kidId };

    const events = (await this.events())
      .filter((e) => (only !== null ? e.id === only : e.date >= todayIL()))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    let target: { state: EventState; leg: Leg; offerId: string } | null = null;
    outer: for (const state of events) {
      for (const leg of LEGS) {
        const offer = state.offers[leg].find((o) => o.kidIds.includes(row.kidId));
        if (offer && !offer.run?.picked.includes(row.kidId)) {
          target = { state, leg, offerId: offer.id };
          break outer;
        }
      }
    }
    if (!target) throw new ApiError("not_found");

    const families = await this.families();
    const action: Action = { type: "setKidReady", offerId: target.offerId, kidId: row.kidId, ready };
    const now = Date.now();
    const result = applyAction(target.state, { families, newId: () => newId(8) }, action, family.id, now);
    if (!result.ok) throw new ApiError(result.error);
    const eventId = target.state.id;
    const entry: LogEntry = {
      id: pad(result.state.version),
      eventId,
      at: now,
      familyId: family.id,
      action,
      inverse: result.inverse,
    };
    await this.ctx.storage.put({ [`event:${eventId}`]: result.state, [logKey(eventId, entry.id)]: entry });
    this.broadcast({ t: "event", eventId, version: result.state.version });
    return json({ ok: true });
  }

  /* ---------- websocket (hibernation API) ---------- */

  private async wsUpgrade(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new ApiError("invalid");
    const meta = await this.meta();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ t: "group", version: meta.version } satisfies WsMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
    /* clients only listen; "ping" is answered by the auto-response pair */
  }

  override webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): void {
    try {
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, "bye");
    } catch {
      /* already closed */
    }
  }

  override webSocketError(ws: WebSocket, _error: unknown): void {
    try {
      ws.close(1011, "error");
    } catch {
      /* already closed */
    }
  }

  /* ---------- images ---------- */

  private async imagePost(request: Request): Promise<Response> {
    await this.requireFamily(request);
    const meta = await this.meta();
    const mime = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!(IMAGE_MIMES as readonly string[]).includes(mime)) throw new ApiError("invalid");
    const declared = Number(request.headers.get("Content-Length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) {
      // Drain rather than abandon the body: an unread request body makes local dev (miniflare) fail the fetch.
      await request.arrayBuffer().catch(() => undefined);
      throw new ApiError("too_large");
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ApiError("too_large");
    if (bytes.byteLength === 0) throw new ApiError("invalid");
    const imageId = await createImageStore(this.env, meta.id, this.ctx.storage).put(bytes, mime);
    return json({ imageId });
  }

  private async imageGet(imageId: string): Promise<Response> {
    const meta = await this.meta();
    const img = await createImageStore(this.env, meta.id, this.ctx.storage).get(imageId);
    if (!img) throw new ApiError("not_found");
    return new Response(img.bytes, {
      headers: {
        "Content-Type": img.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /* ---------- optional add-ons ---------- */

  private async inviteParse(request: Request): Promise<Response> {
    await this.requireFamily(request);
    const meta = await this.meta();
    const body = await readJson(request);
    const imageId = isObj(body) ? (body as Partial<InviteParseRequest>).imageId : undefined;
    if (!isId(imageId)) throw new ApiError("invalid");
    const { ANTHROPIC_API_KEY: apiKey, AI: ai } = this.env;
    if (!apiKey && !ai) throw new ApiError("feature_off");
    const img = await createImageStore(this.env, meta.id, this.ctx.storage).get(imageId);
    if (!img) throw new ApiError("not_found");
    if (apiKey) return json(await parseInvite(apiKey, img, todayIL()));
    return json(await parseInviteWithWorkersAI(ai!, this.env.INVITE_MODEL || DEFAULT_INVITE_MODEL, img, todayIL()));
  }

  /**
   * `{ kind: "event", name }` → an English word for the event slug (no "taken" check: the full event slug is
   * de-duplicated on create). `{ kind: "kid", name, kidId?, taken? }` → a link name that no other kid of the
   * group answers to and that is not in `taken` (the form's other rows). No family needed (registration
   * asks too). `{ slug? }`; any AI trouble → `{}`.
   */
  private async suggestSlug(request: Request): Promise<Response> {
    await this.meta();
    const body = await readJson(request);
    if (!isObj(body)) throw new ApiError("invalid");
    const name = cleanText(body.name, 100);
    if (!name || (body.kind !== "event" && body.kind !== "kid")) throw new ApiError("invalid");
    if (body.kind === "event") return json(await aiSlugSuggestion(this.env, name, "event", async () => false));
    const kidId = typeof body.kidId === "string" ? body.kidId : undefined;
    if (body.taken !== undefined && (!Array.isArray(body.taken) || body.taken.length > 20)) throw new ApiError("invalid");
    const taken = takenKidKeys(await this.families(), kidId ? [kidId] : []);
    for (const s of (body.taken as unknown[] | undefined) ?? []) if (isKidSlug(s)) taken.add(s);
    return json(await aiSlugSuggestion(this.env, name, "kid", async (s) => taken.has(s)));
  }

  private async places(request: Request, url: URL): Promise<Response> {
    await this.requireFamily(request);
    const apiKey = this.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new ApiError("feature_off");
    const q = cleanText(url.searchParams.get("q") ?? "", 100);
    if (!q) return json({ suggestions: [] });
    return json(await placesAutocomplete(apiKey, q));
  }

  /* ---------- feedback fallback storage (RPC; only used when there is no R2 binding) ---------- */

  async feedbackPut(key: string, value: ArrayBuffer | string): Promise<void> {
    await this.ctx.storage.put(`fb:${key}`, value);
  }

  async feedbackGet(key: string): Promise<ArrayBuffer | string | null> {
    return (await this.ctx.storage.get<ArrayBuffer | string>(`fb:${key}`)) ?? null;
  }
}
