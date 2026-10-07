/** Feedback endpoints (no identity key needed). */
import type {
  FeedbackAudioResponse,
  FeedbackInput,
  FeedbackResponse,
  FeedbackScreenshotResponse,
} from "../../shared/feedback.ts";

async function post<T>(path: string, body: BodyInit, contentType: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": contentType }, body });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const feedbackApi = {
  audio: (blob: Blob) => post<FeedbackAudioResponse>("/api/feedback/audio", blob, blob.type || "audio/webm"),
  screenshot: (blob: Blob) => post<FeedbackScreenshotResponse>("/api/feedback/screenshot", blob, blob.type || "image/jpeg"),
  send: (input: FeedbackInput) => post<FeedbackResponse>("/api/feedback", JSON.stringify(input), "application/json"),
};
