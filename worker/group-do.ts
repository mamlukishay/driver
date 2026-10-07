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
import { FAMILY_KEY_HEADER, LEGS, MAX_IMAGE_BYTES } from "../shared/types.ts";
import { applyAction, undo } from "../shared/actions.ts";
import type { ActionCtx } from "../shared/actions.ts";
import { eventSummary, familyPrivate, familyPublic, kidView, LOG_TAIL, viewFor } from "../shared/view.ts";
import {
  buildFamily,
  cleanText,
  createEventState,
  validateEventInput,
  validateFamilyInput,
} from "../shared/validate.ts";
import {
  formatFamilyKey,
  familySecret,
  isId,
  kidToken as newKidToken,
  newId,
  parseFamilyKey,
  sha256hex,
} from "../shared/ids.ts";
import { ApiError, errorResponse, isObj, json, readJson } from "./http.ts";
import { createImageStore, IMAGE_MIMES } from "./images.ts";
import { parseInvite } from "./invite.ts";
import { placesAutocomplete } from "./google.ts";

const FAMILY_COLORS = 5;
const MAX_FAMILIES = 100;
const SEQ_WIDTH = 8;

const pad = (n: number) => String(n).padStart(SEQ_WIDTH, "0");
const logKey = (eventId: string, seq: string) => `log:${eventId}:${seq}`;
const kidTokenKey = (token: string) => `kidtoken:${token}`;

interface KidTokenRow {
  kidId: string;
  familyId: string;
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** `yyyy-mm-dd` in Israel. */
function todayIL(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
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

    if (seg[0] !== "api") throw new ApiError("not_found");

    if (seg[1] === "kid") {
      const token = seg[3];
      if (!token || !isId(token)) throw new ApiError("not_found");
      if (seg.length === 4 && m === "GET") return this.kidGet(token);
      if (seg.length === 5 && seg[4] === "ready" && m === "POST") return this.kidReady(request, token);
      throw new ApiError("not_found");
    }

    if (seg[1] !== "g") throw new ApiError("not_found");
    const rest = seg.slice(3);

    if (rest[0] === "__init" && rest.length === 1 && m === "POST") return this.init(request, seg[2]!);

    if (rest.length === 0 && m === "GET") return this.groupGet(request);
    if (rest[0] === "families" && rest.length === 1 && m === "POST") return this.registerFamily(request);
    if (rest[0] === "families" && rest[1] === "me" && rest.length === 2 && m === "PUT") return this.updateMe(request);
    if (rest[0] === "events") {
      if (rest.length === 1 && m === "POST") return this.createEvent(request);
      const id = rest[1];
      if (id && isId(id)) {
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
    throw new ApiError("not_found");
  }

  /* ---------- storage helpers ---------- */

  private async meta(): Promise<GroupMeta> {
    const meta = await this.ctx.storage.get<GroupMeta>("meta");
    if (!meta) throw new ApiError("not_found");
    return meta;
  }

  private async families(): Promise<Family[]> {
    return [...(await this.ctx.storage.list<Family>({ prefix: "family:" })).values()];
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

  /** Authenticates `X-Family-Key`. Null when the header is absent; 403 when present but wrong. */
  private async authenticate(request: Request): Promise<Family | null> {
    const header = request.headers.get(FAMILY_KEY_HEADER);
    if (header === null || header === "") return null;
    const parsed = parseFamilyKey(header);
    if (!parsed) throw new ApiError("forbidden");
    const hash = await sha256hex(parsed.secret);
    const family = await this.ctx.storage.get<Family>(`family:${parsed.familyId}`);
    const ok = safeEqual(hash, family?.keyHash ?? "0".repeat(64));
    if (!family || !ok) throw new ApiError("forbidden");
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
    if (await this.ctx.storage.get("meta")) throw new ApiError("invalid");
    const body = await readJson(request);
    const name = isObj(body) ? cleanText(body.name, 60) : null;
    if (!name) throw new ApiError("invalid");
    const meta: GroupMeta = { id, name, createdAt: Date.now(), version: 1 };
    await this.ctx.storage.put("meta", meta);
    return json({ ok: true });
  }

  private async groupGet(request: Request): Promise<Response> {
    const me = await this.authenticate(request);
    const meta = await this.meta();
    const [families, events] = await Promise.all([this.families(), this.events()]);
    const today = todayIL();
    const summaries = events.map(eventSummary);
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
    const secret = familySecret();
    const keyHash = await sha256hex(secret);

    const meta = await this.meta();
    const families = await this.families();
    if (families.length >= MAX_FAMILIES) throw new ApiError("invalid");
    const id = newId(8);
    const family = buildFamily(
      input.value,
      { id, color: families.length % FAMILY_COLORS, keyHash, createdAt: Date.now() },
      null,
      { id: () => newId(8), kidToken: newKidToken },
    );
    const writes: Record<string, unknown> = { [`family:${id}`]: family };
    for (const kid of family.kids) writes[kidTokenKey(kid.kidToken)] = { kidId: kid.id, familyId: id } satisfies KidTokenRow;
    meta.version += 1;
    writes.meta = meta;
    await this.ctx.storage.put(writes);
    this.broadcast({ t: "group", version: meta.version });
    const res: RegisterFamilyResponse = { familyId: id, key: formatFamilyKey(id, secret) };
    return json(res);
  }

  private async updateMe(request: Request): Promise<Response> {
    const auth = await this.requireFamily(request);
    const input = validateFamilyInput(await readJson(request));
    if (!input.ok) throw new ApiError("invalid");

    const prev = await this.ctx.storage.get<Family>(`family:${auth.id}`);
    if (!prev) throw new ApiError("forbidden");
    const meta = await this.meta();
    const family = buildFamily(
      input.value,
      { id: prev.id, color: prev.color, keyHash: prev.keyHash, createdAt: prev.createdAt },
      prev,
      { id: () => newId(8), kidToken: newKidToken },
    );
    const writes: Record<string, unknown> = { [`family:${prev.id}`]: family };
    const keep = new Set(family.kids.map((k) => k.kidToken));
    const stale = prev.kids.filter((k) => !keep.has(k.kidToken)).map((k) => kidTokenKey(k.kidToken));
    for (const kid of family.kids) writes[kidTokenKey(kid.kidToken)] = { kidId: kid.id, familyId: prev.id } satisfies KidTokenRow;
    meta.version += 1;
    writes.meta = meta;
    await this.ctx.storage.put(writes);
    if (stale.length) await this.ctx.storage.delete(stale);
    this.broadcast({ t: "group", version: meta.version });
    return json({ me: familyPrivate(family) });
  }

  /* ---------- events ---------- */

  private async createEvent(request: Request): Promise<Response> {
    const family = await this.requireFamily(request);
    const input = validateEventInput(await readJson(request));
    if (!input.ok) throw new ApiError("invalid");
    const meta = await this.meta();
    const id = newId(8);
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
      action: action as unknown as Action,
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

  private async kidFamily(token: string): Promise<{ family: Family; row: KidTokenRow }> {
    const row = await this.ctx.storage.get<KidTokenRow>(kidTokenKey(token));
    const family = row && (await this.ctx.storage.get<Family>(`family:${row.familyId}`));
    if (!row || !family || !family.kids.some((k) => k.id === row.kidId && k.kidToken === token)) {
      throw new ApiError("not_found");
    }
    return { family, row };
  }

  private async kidGet(token: string): Promise<Response> {
    const meta = await this.meta();
    await this.kidFamily(token);
    const [families, events] = await Promise.all([this.families(), this.events()]);
    const view = kidView(meta, families, events, token, todayIL());
    if (!view) throw new ApiError("not_found");
    return json(view);
  }

  /**
   * "אני מוכן/ה": marks the kid ready on the next ride they are seated in
   * (earliest upcoming event, outbound before return, skipping rides already picked up).
   * Optional body `{ ready?: boolean }` (default true).
   */
  private async kidReady(request: Request, token: string): Promise<Response> {
    const body = await readJson(request, true);
    const ready = isObj(body) && typeof body.ready === "boolean" ? body.ready : true;
    await this.meta();
    const { family, row } = await this.kidFamily(token);

    const events = (await this.events())
      .filter((e) => e.date >= todayIL())
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
    if (declared > MAX_IMAGE_BYTES) throw new ApiError("too_large");
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
    const apiKey = this.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ApiError("feature_off");
    const img = await createImageStore(this.env, meta.id, this.ctx.storage).get(imageId);
    if (!img) throw new ApiError("not_found");
    return json(await parseInvite(apiKey, img, todayIL()));
  }

  private async places(request: Request, url: URL): Promise<Response> {
    await this.requireFamily(request);
    const apiKey = this.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new ApiError("feature_off");
    const q = cleanText(url.searchParams.get("q") ?? "", 100);
    if (!q) return json({ suggestions: [] });
    return json(await placesAutocomplete(apiKey, q));
  }
}
