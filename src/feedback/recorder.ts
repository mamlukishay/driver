/** Voice recording for feedback: MediaRecorder with a supported mime type, mm:ss timer, auto-stop at 2:00. */
import { useEffect, useRef, useState } from "preact/hooks";
import { FEEDBACK_MAX_RECORD_SECONDS } from "../../shared/feedback.ts";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];

export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const can = (t: string) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  };
  return MIME_CANDIDATES.find(can) ?? "";
}

export const recordingSupported = () =>
  typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

export const fmtClock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export type RecState = "idle" | "recording";
export type RecProblem = "denied" | "unsupported" | null;

export function useRecorder(onDone: (blob: Blob) => void) {
  const [state, setState] = useState<RecState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<RecProblem>(recordingSupported() ? null : "unsupported");
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const done = useRef(onDone);
  done.current = onDone;

  const cleanup = () => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const stop = () => {
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
    else {
      cleanup();
      setState("idle");
    }
  };

  const start = async () => {
    if (!recordingSupported()) {
      setProblem("unsupported");
      return;
    }
    const mime = pickAudioMime();
    if (mime === null) {
      setProblem("unsupported");
      return;
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setProblem(e instanceof DOMException && e.name === "NotFoundError" ? "unsupported" : "denied");
      return;
    }
    stream.current = s;
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      cleanup();
      setProblem("unsupported");
      return;
    }
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    r.onstop = () => {
      cleanup();
      rec.current = null;
      setState("idle");
      const type = r.mimeType || mime || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size > 0) done.current(blob);
    };
    rec.current = r;
    setProblem(null);
    setSeconds(0);
    setState("recording");
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setSeconds(sec);
      if (sec >= FEEDBACK_MAX_RECORD_SECONDS) stop();
    }, 250);
    r.start(1000);
  };

  // Release the mic if the sheet closes mid-recording.
  useEffect(
    () => () => {
      const r = rec.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        r.stop();
      }
      cleanup();
    },
    [],
  );

  return { state, seconds, problem, start, stop, toggle: () => (state === "recording" ? stop() : void start()) };
}
