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

/* ---------- audio player card + page (for the GitHub issue, which can't embed external <audio>) ---------- */

/** `?s=` → whole seconds 0..600, or null when missing/invalid (the card then shows no duration). */
export function cardSeconds(v: string | null): number | null {
  if (v === null || !/^\d{1,6}$/.test(v)) return null;
  return Math.min(600, Number(v));
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Fixed pseudo-waveform heights (px), so every card looks the same apart from the duration. */
const WAVE = [4, 7, 11, 6, 13, 9, 15, 10, 5, 12, 16, 8, 5, 11, 14, 7, 9, 15, 6, 12, 8, 4, 10, 13, 7, 5, 9, 12, 6, 10, 14, 8, 5, 7];

/** ~360×64 image that looks like an audio player: play button, label, mm:ss (when known), a flat fake waveform. */
export function audioCardSvg(seconds: number | null): string {
  const waveX = seconds === null ? 64 : 112;
  const n = Math.floor((344 - waveX) / 6);
  const bars = Array.from({ length: n }, (_, i) => WAVE[i % WAVE.length]!)
    .map((h, i) => `<rect x="${waveX + i * 6}" y="${44 - h / 2}" width="3" height="${h}" rx="1.5"/>`)
    .join("");
  const dur = seconds === null ? "" : `<text x="64" y="49" font-size="13" fill="#57606a">${mmss(seconds)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="64" viewBox="0 0 360 64" role="img" aria-label="Play recording">
<rect x="0.5" y="0.5" width="359" height="63" rx="14" fill="#f6f8fa" stroke="#d0d7de"/>
<circle cx="32" cy="32" r="20" fill="#d97706"/>
<path d="M26 21.5 L43 32 L26 42.5 Z" fill="#ffffff"/>
<g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
<text x="64" y="26" font-size="14" font-weight="600" fill="#1f2328">Play recording · השמעת ההקלטה</text>
${dur}
</g>
<g fill="#d97706" fill-opacity="0.5">${bars}</g>
</svg>`;
}

/** `audioId` is validated by `isFeedbackId` (lowercase letters and digits), so it is safe in HTML as-is. */
export function audioPlayerHtml(audioId: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>הקלטת משוב</title>
<style>
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:16px;box-sizing:border-box;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f6f8fa;color:#1f2328}
h1{font-size:18px;font-weight:600;margin:0}
audio{width:100%;max-width:420px}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}}
</style>
</head>
<body>
<h1>🎙️ הקלטת משוב</h1>
<audio controls autoplay preload="auto" src="/api/feedback/audio/${audioId}"></audio>
</body>
</html>
`;
}

async function createIssue(env: Env, record: FeedbackRecord, origin: string): Promise<string | undefined> {
  const token = env.GITHUB_FEEDBACK_TOKEN;
  if (!token) return undefined;
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const audioBase = record.audioId ? `${origin}/api/feedback/audio/${record.audioId}` : undefined;
  const body = issueBody(record, {
    ...(audioBase
      ? {
          audioUrl: audioBase,
          audioPlayerUrl: `${audioBase}/play`,
          audioCardUrl: `${audioBase}/card.svg${record.audioSeconds !== undefined ? `?s=${record.audioSeconds}` : ""}`,
        }
      : {}),
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

  if (kind === "audio" && seg.length === 5 && m === "GET") {
    const id = seg[3];
    if (!isFeedbackId(id)) throw new ApiError("not_found");
    if (seg[4] === "card.svg") {
      // Static apart from the duration; no storage lookup, so it is cheap for GitHub's image proxy.
      return new Response(audioCardSvg(cardSeconds(url.searchParams.get("s"))), {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (seg[4] === "play") {
      if (!(await store.getBlob(AUDIO_PREFIX + id))) throw new ApiError("not_found");
      return new Response(audioPlayerHtml(id), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Content-Security-Policy": "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
  }

  throw new ApiError("not_found");
}
