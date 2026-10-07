/** Typed client for build-plan §3. Attaches X-Family-Key from the device identity for the group. */
import type {
  ActionResponse,
  ConfigResponse,
  CreateEventResponse,
  CreateGroupResponse,
  EventInput,
  EventView,
  FamilyInput,
  GroupResponse,
  ImageUploadResponse,
  InviteParseResponse,
  KidView,
  PlacesResponse,
  PublicAction,
  RegisterFamilyResponse,
  UndoResponse,
  UpdateFamilyResponse,
} from "../shared/types.ts";
import { FAMILY_KEY_HEADER } from "../shared/types.ts";
import { getIdentity, removeIdentity } from "./identity.ts";
import type { ClientErrorCode } from "./i18n/he.ts";

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status = 0,
  ) {
    super(code);
  }
}

interface ReqOpts {
  method?: string;
  body?: unknown;
  raw?: Blob;
  /** Group whose identity key to attach. */
  group?: string;
  /** Explicit key (e.g. while importing a device link). */
  key?: string;
}

async function req<T>(path: string, o: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const key = o.key ?? (o.group ? getIdentity(o.group)?.key : undefined);
  if (key) headers[FAMILY_KEY_HEADER] = key;
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
    res = await fetch(path, { method: o.method ?? (body ? "POST" : "GET"), headers, body });
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
    // A stored key the server rejects is useless: drop it and fall back to view-only.
    if (res.status === 403 && key && !o.key && o.group) {
      const rejected = await isKeyRejected(o.group, key, path);
      if (rejected) removeIdentity(o.group);
    }
    throw new ApiError(code, res.status);
  }
  return data as T;
}

/** Distinguishes "bad key" from "not allowed to do that": the optional-auth GET only 403s on a bad key. */
async function isKeyRejected(group: string, key: string, path: string): Promise<boolean> {
  const groupPath = `/api/g/${group}`;
  if (path === groupPath || /\/events\/[^/]+$/.test(path)) return true;
  try {
    const r = await fetch(groupPath, { headers: { [FAMILY_KEY_HEADER]: key } });
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
        return { features: { places: false, routes: false, inviteParse: false } };
      });
    }
    return configPromise;
  },

  createGroup: (name: string) => req<CreateGroupResponse>("/api/groups", { body: { name } }),

  getGroup: (group: string) => req<GroupResponse>(g(group), { group }),
  getGroupWithKey: (group: string, key: string) => req<GroupResponse>(g(group), { key }),

  register: (group: string, input: FamilyInput) =>
    req<RegisterFamilyResponse>(`${g(group)}/families`, { body: input }),

  updateMe: (group: string, input: FamilyInput) =>
    req<UpdateFamilyResponse>(`${g(group)}/families/me`, { method: "PUT", body: input, group }),

  createEvent: (group: string, input: EventInput) =>
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

  getKid: (group: string, token: string) =>
    req<KidView>(`/api/kid/${encodeURIComponent(group)}/${encodeURIComponent(token)}`),

  kidReady: (group: string, token: string, ready = true) =>
    req<{ ok: true }>(`/api/kid/${encodeURIComponent(group)}/${encodeURIComponent(token)}/ready`, {
      body: { ready },
    }),

  parseInvite: (group: string, imageId: string) =>
    req<InviteParseResponse>(`${g(group)}/invite/parse`, { body: { imageId }, group }),

  places: (group: string, q: string) =>
    req<PlacesResponse>(`${g(group)}/places?q=${encodeURIComponent(q)}`, { group }),

  wsUrl: (group: string) =>
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${g(group)}/ws`,
};
