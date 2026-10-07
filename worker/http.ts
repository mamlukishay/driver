import type { ErrorCode } from "../shared/types.ts";
import { ERROR_STATUS } from "../shared/types.ts";

/** Thrown inside handlers; turned into `{ error }` with the matching status. */
export class ApiError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function errorResponse(code: ErrorCode): Response {
  return json({ error: code }, ERROR_STATUS[code]);
}

const MAX_JSON_BYTES = 64 * 1024;

/** Reads a small JSON body; `invalid` when missing, oversized or malformed. */
export async function readJson(request: Request, optional = false): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new ApiError("invalid");
  if (text.trim() === "") {
    if (optional) return {};
    throw new ApiError("invalid");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid");
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
