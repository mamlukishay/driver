/** Typed client for build-plan §3. Attaches X-Family-Id from the device identity for the group. */
import type {
  ActionResponse,
  ConfigResponse,
  CreateEventRequest,
  CreateEventResponse,
  CreateGroupResponse,
  EventView,
  FamilyInput,
  GroupResponse,
  ImageUploadResponse,
  InviteParseResponse,
  KidView,
  PlacesResponse,
  PublicAction,
  RegisterFamilyResponse,
  SuggestGroupSlugRequest,
  SuggestSlugResponse,
  UndoResponse,
  UpdateGroupRequest,
  UpdateGroupResponse,
  UpdateFamilyResponse,
} from "../shared/types.ts";
import { FAMILY_ID_HEADER } from "../shared/types.ts";
import { getIdentity, markGroupDeleted, removeIdentity } from "./identity.ts";
import type { ClientErrorCode } from "./i18n/he.ts";

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status = 0,
    /** The parsed error body (e.g. `suggestion` for `slug_taken`). */
    readonly data: Record<string, unknown> | null = null,
  ) {
    super(code);
  }
}

interface ReqOpts {
  method?: string;
  body?: unknown;
  raw?: Blob;
  /** Group whose identity (family id) to attach. */
  group?: string;
  signal?: AbortSignal;
}

async function req<T>(path: string, o: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const familyId = o.group ? getIdentity(o.group) : null;
  if (familyId) headers[FAMILY_ID_HEADER] = familyId;
  let body: BodyInit | undefined;
  if (o.raw) {
    body = o.raw;
    headers["content-type"] = o.raw.type || "image/jpeg";
  } else if (o.body !== undefined) {
    body = JSON.stringify(o.body);
    headers["content-type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(path, { method: o.method ?? (body ? "POST" : "GET"), headers, body, signal: o.signal });
  } catch {
    throw new ApiError("network");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON */
  }
  if (!res.ok) {
    const code = (data as { error?: ClientErrorCode } | null)?.error ?? "unknown";
    // A stored family the group doesn't know (e.g. removed) is useless: drop it.
    if (res.status === 403 && familyId && o.group) {
      if (await isFamilyUnknown(o.group, familyId, path)) removeIdentity(o.group);
    }
    throw new ApiError(code, res.status, data as Record<string, unknown> | null);
  }
  return data as T;
}

/** Distinguishes "unknown family" from "not allowed to do that": the optional-auth GETs only 403 on an unknown family. */
async function isFamilyUnknown(group: string, familyId: string, path: string): Promise<boolean> {
  const groupPath = g(group);
  if (path === groupPath || /\/events\/[^/]+$/.test(path)) return true;
  try {
    const r = await fetch(groupPath, { headers: { [FAMILY_ID_HEADER]: familyId } });
    return r.status === 403;
  } catch {
    return false;
  }
}

const g = (group: string) => `/api/g/${encodeURIComponent(group)}`;

let configPromise: Promise<ConfigResponse> | null = null;

export const api = {
  getConfig(): Promise<ConfigResponse> {
    if (!configPromise) {
      configPromise = req<ConfigResponse>("/api/config").catch(() => {
        configPromise = null;
        return { features: { places: false, routes: false, inviteParse: false, slugSuggest: false } };
      });
    }
    return configPromise;
  },

  createGroup: (name: string, slug: string, whatsappUrl?: string) =>
    req<CreateGroupResponse>("/api/groups", { body: whatsappUrl ? { name, slug, whatsappUrl } : { name, slug } }),

  /** An English URL name for a (Hebrew) group name, from Workers AI; `{}` when it has none. */
  suggestSlug: (name: string, signal?: AbortSignal) => req<SuggestSlugResponse>("/api/groups/suggest-slug", { body: { name }, signal }),

  /** An English event word or kid link name from Workers AI (`kind`); `{}` when it has none. */
  suggestGroupSlug: (group: string, body: SuggestGroupSlugRequest, signal?: AbortSignal) =>
    req<SuggestSlugResponse>(`${g(group)}/suggest-slug`, { body, signal }),

  /** A 404 for a group this device has a family in means it was deleted: forget it here. */
  getGroup: (group: string) =>
    req<GroupResponse>(g(group), { group }).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404 && getIdentity(group)) markGroupDeleted(group);
      throw e;
    }),

  updateGroup: (group: string, patch: UpdateGroupRequest) =>
    req<UpdateGroupResponse>(g(group), { method: "PATCH", body: patch, group }),

  deleteGroup: (group: string) => req<{ ok: true }>(g(group), { method: "DELETE", group }),

  register: (group: string, input: FamilyInput) =>
    req<RegisterFamilyResponse>(`${g(group)}/families`, { body: input }),

  updateMe: (group: string, input: FamilyInput) =>
    req<UpdateFamilyResponse>(`${g(group)}/families/me`, { method: "PUT", body: input, group }),

  createEvent: (group: string, input: CreateEventRequest) =>
    req<CreateEventResponse>(`${g(group)}/events`, { body: input, group }),

  getEvent: (group: string, event: string) =>
    req<EventView>(`${g(group)}/events/${encodeURIComponent(event)}`, { group }),

  act: (group: string, event: string, action: PublicAction, expectedVersion?: number) =>
    req<ActionResponse>(`${g(group)}/events/${encodeURIComponent(event)}/actions`, {
      body: expectedVersion === undefined ? action : { ...action, expectedVersion },
      group,
    }),

  undo: (group: string, event: string, logId: string) =>
    req<UndoResponse>(`${g(group)}/events/${encodeURIComponent(event)}/undo`, { body: { logId }, group }),

  uploadImage: (group: string, blob: Blob) =>
    req<ImageUploadResponse>(`${g(group)}/images`, { raw: blob, group }),

  imageUrl: (group: string, imageId: string) => `${g(group)}/images/${encodeURIComponent(imageId)}`,

  /** With `event`, the view holds only that event (`?event=<slug>`). */
  getKid: (group: string, kidId: string, event?: string) =>
    req<KidView>(`${g(group)}/kid/${encodeURIComponent(kidId)}${event ? `?event=${encodeURIComponent(event)}` : ""}`),

  kidReady: (group: string, kidId: string, ready = true, event?: string) =>
    req<{ ok: true }>(`${g(group)}/kid/${encodeURIComponent(kidId)}/ready`, { body: event ? { ready, event } : { ready } }),

  parseInvite: (group: string, imageId: string) =>
    req<InviteParseResponse>(`${g(group)}/invite/parse`, { body: { imageId }, group }),

  places: (group: string, q: string) =>
    req<PlacesResponse>(`${g(group)}/places?q=${encodeURIComponent(q)}`, { group }),

  wsUrl: (group: string) =>
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${g(group)}/ws`,
};
