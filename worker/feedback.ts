/**
 * In-app feedback: `/api/feedback*`. No auth (kid pages use it too); sizes are capped and there is a naive
 * per-isolate rate limit. Blobs and records go to R2 (`IMAGES` binding) or, without it, to a dedicated
 * GroupDO instance's storage. A GitHub issue is opened when GITHUB_FEEDBACK_TOKEN is set; its failure never
 * fails the user.
 */
import { newId } from "../shared/ids.ts";
import {
  baseMime,
  FEEDBACK_MAX_AUDIO_BYTES,
  FEEDBACK_MAX_SCREENSHOT_BYTES,
  FEEDBACK_MAX_TRANSCRIPT,
  feedbackRecordKey,
  isFeedbackAudioMime,
  isFeedbackId,
  isFeedbackScreenshotMime,
  issueBody,
  issueLabels,
  issueTitle,
  stripControl,
  validateFeedback,
  type FeedbackAudioResponse,
  type FeedbackRecord,
  type FeedbackResponse,
  type FeedbackScreenshotResponse,
} from "../shared/feedback.ts";
import type { Env } from "./env.ts";
import { ApiError, json, readJson } from "./http.ts";

export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const AUDIO_PREFIX = "feedback-audio/";
const SHOT_PREFIX = "feedback-shots/";
const DEFAULT_REPO = "mamlukishay/driver";

/* ---------- rate limit (per isolate, best effort) ---------- */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(request: Request, bucket: string, now = Date.now()): boolean {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return false;
}

const tooMany = () => json({ error: "rate_limited" }, 429);

/* ---------- blob store ---------- */

interface StoredBlob {
  bytes: ArrayBuffer;
  mime: string;
}

interface FeedbackStore {
  putBlob(key: string, bytes: ArrayBuffer, mime: string): Promise<void>;
  getBlob(key: string): Promise<StoredBlob | null>;
  putJson(key: string, value: unknown): Promise<void>;
}

class R2FeedbackStore implements FeedbackStore {
  constructor(private readonly bucket: R2Bucket) {}
  async putBlob(key: string, bytes: ArrayBuffer, mime: string) {
    await this.bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
  }
  async getBlob(key: string) {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return { bytes: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? "application/octet-stream" };
  }
  async putJson(key: string, value: unknown) {
    await this.bucket.put(key, JSON.stringify(value, null, 2), { httpMetadata: { contentType: "application/json" } });
  }
}

/** Durable Object storage caps a value at ~2 MB, so blobs are split into 1 MB chunks. */
const CHUNK = 1024 * 1024;

class DoFeedbackStore implements FeedbackStore {
  constructor(private readonly env: Env) {}
  private get stub() {
    // Not a valid group id (see shared/ids.ts), so it can never collide with a real group.
    return this.env.GROUP.get(this.env.GROUP.idFromName("__feedback__"));
  }
  async putBlob(key: string, bytes: ArrayBuffer, mime: string) {
    const chunks = Math.max(1, Math.ceil(bytes.byteLength / CHUNK));
    for (let i = 0; i < chunks; i++) await this.stub.feedbackPut(`${key}:${i}`, bytes.slice(i * CHUNK, (i + 1) * CHUNK));
    await this.stub.feedbackPut(`${key}:meta`, JSON.stringify({ mime, chunks, size: bytes.byteLength }));
  }
  async getBlob(key: string) {
    const meta = await this.stub.feedbackGet(`${key}:meta`);
    if (typeof meta !== "string") return null;
    const { mime, chunks, size } = JSON.parse(meta) as { mime: string; chunks: number; size: number };
    const out = new Uint8Array(size);
    let at = 0;
    for (let i = 0; i < chunks; i++) {
      const part = await this.stub.feedbackGet(`${key}:${i}`);
      if (!(part instanceof ArrayBuffer)) return null;
      out.set(new Uint8Array(part), at);
      at += part.byteLength;
    }
    return { bytes: out.buffer, mime };
  }
  async putJson(key: string, value: unknown) {
    await this.stub.feedbackPut(key, JSON.stringify(value));
  }
}

const storeFor = (env: Env): FeedbackStore => (env.IMAGES ? new R2FeedbackStore(env.IMAGES) : new DoFeedbackStore(env));

/* ---------- helpers ---------- */

async function readBody(request: Request, max: number): Promise<ArrayBuffer> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > max) throw new ApiError("too_large");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > max) throw new ApiError("too_large");
  if (bytes.byteLength === 0) throw new ApiError("invalid");
  return bytes;
}

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Whisper via Workers AI. Any failure (no binding, local dev without remote bindings, model error) → null. */
async function transcribe(env: Env, bytes: ArrayBuffer): Promise<string | null> {
  if (!env.AI) return null;
  try {
    const run = env.AI.run(WHISPER_MODEL, { audio: toBase64(bytes), language: "he" });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("whisper timeout")), 45_000));
    const res = (await Promise.race([run, timeout])) as { text?: unknown };
    const text = typeof res?.text === "string" ? stripControl(res.text).slice(0, FEEDBACK_MAX_TRANSCRIPT) : "";
    return text || null;
  } catch (e) {
    console.warn("feedback: transcription failed", e instanceof Error ? e.message : e);
    return null;
  }
}

function serveBlob(b: StoredBlob): Response {
  return new Response(b.bytes, {
    headers: {
      "Content-Type": b.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

async function createIssue(env: Env, record: FeedbackRecord, origin: string): Promise<string | undefined> {
  const token = env.GITHUB_FEEDBACK_TOKEN;
  if (!token) return undefined;
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const body = issueBody(record, {
    ...(record.audioId ? { audioUrl: `${origin}/api/feedback/audio/${record.audioId}` } : {}),
    ...(record.screenshotId ? { screenshotUrl: `${origin}/api/feedback/screenshot/${record.screenshotId}` } : {}),
  });
  const post = (labels?: string[]) =>
    fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "trempush",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: issueTitle(record), body, ...(labels ? { labels } : {}) }),
    });
  try {
    let res = await post(issueLabels(record.kind));
    // Labels can be rejected (e.g. the token can't create them); retry without.
    if (res.status === 422) res = await post();
    if (!res.ok) {
      console.error("feedback: GitHub issue failed", res.status, (await res.text()).slice(0, 500));
      return undefined;
    }
    const data = (await res.json()) as { html_url?: unknown };
    return typeof data.html_url === "string" ? data.html_url : undefined;
  } catch (e) {
    console.error("feedback: GitHub issue error", e);
    return undefined;
  }
}

/* ---------- routes ---------- */

/** `seg` is the path split on "/" with `seg[0] === "api"` and `seg[1] === "feedback"`. */
export async function handleFeedback(request: Request, env: Env, seg: string[], url: URL): Promise<Response> {
  const m = request.method;
  const store = storeFor(env);

  if (seg.length === 2 && m === "POST") {
    if (rateLimited(request, "fb")) return tooMany();
    const v = validateFeedback(await readJson(request));
    if (!v.ok) throw new ApiError("invalid");
    const now = new Date();
    const record: FeedbackRecord = { ...v.value, id: newId(16), createdAt: now.toISOString() };
    const key = feedbackRecordKey(record.id, now);
    await store.putJson(key, record);
    const issueUrl = await createIssue(env, record, url.origin);
    if (issueUrl) {
      try {
        await store.putJson(key, { ...record, issueUrl });
      } catch (e) {
        console.error("feedback: record update failed", e);
      }
    }
    return json({ ok: true, id: record.id, ...(issueUrl ? { issueUrl } : {}) } satisfies FeedbackResponse);
  }

  const kind = seg[2];
  if ((kind === "audio" || kind === "screenshot") && seg.length === 3 && m === "POST") {
    if (rateLimited(request, kind)) return tooMany();
    const ct = request.headers.get("Content-Type");
    if (kind === "audio") {
      if (!isFeedbackAudioMime(ct)) throw new ApiError("invalid");
      const bytes = await readBody(request, FEEDBACK_MAX_AUDIO_BYTES);
      const audioId = newId(20);
      await store.putBlob(AUDIO_PREFIX + audioId, bytes, baseMime(ct));
      const transcript = await transcribe(env, bytes);
      return json({ audioId, transcript } satisfies FeedbackAudioResponse);
    }
    if (!isFeedbackScreenshotMime(ct)) throw new ApiError("invalid");
    const bytes = await readBody(request, FEEDBACK_MAX_SCREENSHOT_BYTES);
    const screenshotId = newId(20);
    await store.putBlob(SHOT_PREFIX + screenshotId, bytes, baseMime(ct));
    return json({ screenshotId } satisfies FeedbackScreenshotResponse);
  }

  if ((kind === "audio" || kind === "screenshot") && seg.length === 4 && m === "GET") {
    const id = seg[3];
    if (!isFeedbackId(id)) throw new ApiError("not_found");
    const blob = await store.getBlob((kind === "audio" ? AUDIO_PREFIX : SHOT_PREFIX) + id);
    if (!blob) throw new ApiError("not_found");
    return serveBlob(blob);
  }

  throw new ApiError("not_found");
}
