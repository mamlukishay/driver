/**
 * Floating "משוב" button (every screen, above sheets) + the `?sheet=feedback` sheet.
 * Pressing the button first captures a screenshot of what the user sees, then opens the sheet.
 */
import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FeedbackAudioResponse, FeedbackKind, ScreenshotState } from "../../shared/feedback.ts";
import { FEEDBACK_MAX_TEXT } from "../../shared/feedback.ts";
import { Sheet } from "../components/Sheet.tsx";
import { he } from "../i18n/he.ts";
import { useSheet } from "../nav.ts";
import { feedbackApi } from "./api.ts";
import { captureViewport } from "./capture.ts";
import { collectContext } from "./context.ts";
import { fmtClock, useRecorder } from "./recorder.ts";
import "./feedback.css";

export const FEEDBACK_SHEET = "feedback";

interface Shot {
  blob: Blob;
  url: string;
}

export function FeedbackHost() {
  const { path } = useLocation();
  const sheet = useSheet();
  const open = sheet.name === FEEDBACK_SHEET;
  const [busy, setBusy] = useState(false);
  /** null = not captured (e.g. reload with ?sheet=feedback); "failed" = capture failed. */
  const [shot, setShot] = useState<Shot | "failed" | null>(null);

  useEffect(() => {
    if (open || !shot || shot === "failed") return;
    URL.revokeObjectURL(shot.url);
    setShot(null);
  }, [open]);

  const onPress = async () => {
    if (busy || open) return;
    setBusy(true);
    const blob = await captureViewport();
    setShot((prev) => {
      if (prev && prev !== "failed") URL.revokeObjectURL(prev.url);
      return blob ? { blob, url: URL.createObjectURL(blob) } : "failed";
    });
    setBusy(false);
    sheet.open(FEEDBACK_SHEET);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          class="fb-fab"
          data-feedback-ignore
          aria-label={he.feedback.buttonLabel}
          aria-busy={busy}
          onClick={onPress}
        >
          <ChatIcon />
          <span>{he.feedback.button}</span>
        </button>
      )}
      <Sheet open={open} title={he.feedback.title} onClose={sheet.close}>
        {open && <FeedbackForm path={path} shot={shot} onDone={sheet.close} />}
      </Sheet>
    </>
  );
}

type Phase = "edit" | "sending" | "sent";

/** The one voice recording in the form: played back locally; uploaded in the background right after stop. */
interface Clip {
  id: number;
  url: string;
  seconds: number;
}

function FeedbackForm({ path, shot, onDone }: { path: string; shot: Shot | "failed" | null; onDone: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("improve");
  const [text, setText] = useState("");
  const [clip, setClip] = useState<Clip | null>(null);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [keepShot, setKeepShot] = useState(true);
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Upload of the current clip; null result = upload failed. Replaced/cleared on discard so stale results are ignored. */
  const upload = useRef<{ id: number; result: Promise<FeedbackAudioResponse | null> } | null>(null);
  const clipSeq = useRef(0);
  const clipRef = useRef<Clip | null>(null);
  clipRef.current = clip;
  const player = useRef<HTMLAudioElement | null>(null);

  const stopPlayer = () => {
    const a = player.current;
    if (a) {
      a.onended = null;
      a.pause();
    }
    player.current = null;
    setPlaying(false);
  };

  const dropClip = () => {
    stopPlayer();
    upload.current = null;
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  useEffect(
    () => () => {
      clearTimeout(doneTimer.current);
      player.current?.pause();
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
    },
    [],
  );

  const rec = useRecorder((blob) => {
    const id = ++clipSeq.current;
    const seconds = rec.seconds;
    stopPlayer();
    setNote(null);
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { id, url: URL.createObjectURL(blob), seconds };
    });
    const result = feedbackApi.audio(blob).catch(() => null);
    upload.current = { id, result };
    void result.then((r) => {
      if (r || upload.current?.id !== id) return;
      dropClip();
      setNote(he.feedback.uploadFailed);
    });
  });

  const togglePlay = () => {
    if (!clip) return;
    if (playing) {
      stopPlayer();
      return;
    }
    const a = new Audio(clip.url);
    player.current = a;
    a.onended = () => {
      if (player.current === a) stopPlayer();
    };
    setPlaying(true);
    a.play().catch(() => {
      if (player.current === a) stopPlayer();
    });
  };

  const recording = rec.state === "recording";
  const canSend = phase === "edit" && !recording && (text.trim() !== "" || clip !== null);

  const send = async () => {
    if (!canSend) return;
    stopPlayer();
    setPhase("sending");
    setError(null);
    const up = upload.current;
    const audio = up ? await up.result : null;
    if (!audio && !text.trim()) {
      // The recording was all there was and its upload failed (the note says so).
      setPhase("edit");
      return;
    }
    let screenshot: ScreenshotState = shot === "failed" ? "failed" : shot ? (keepShot ? "attached" : "removed") : "none";
    let screenshotId: string | undefined;
    if (shot && shot !== "failed" && keepShot) {
      try {
        screenshotId = (await feedbackApi.screenshot(shot.blob)).screenshotId;
      } catch {
        screenshot = "failed";
      }
    }
    try {
      await feedbackApi.send({
        kind,
        text: text.trim(),
        // The transcript only goes into the GitHub issue for triage; it is never shown in the form.
        ...(audio ? { audioId: audio.audioId, ...(clip ? { audioSeconds: Math.round(clip.seconds) } : {}) } : {}),
        ...(audio?.transcript ? { transcript: audio.transcript } : {}),
        ...(screenshotId ? { screenshotId } : {}),
        context: collectContext(path, screenshot),
      });
      setPhase("sent");
      doneTimer.current = setTimeout(onDone, 1600);
    } catch {
      setPhase("edit");
      setError(he.feedback.failed);
    }
  };

  if (phase === "sent")
    return (
      <div class="fb-thanks" role="status">
        <span class="fb-check" aria-hidden="true">
          ✓
        </span>
        <b>{he.feedback.thanks}</b>
      </div>
    );

  const problem = rec.problem === "denied" ? he.feedback.micDenied : rec.problem === "unsupported" ? he.feedback.micUnsupported : null;

  return (
    <div class="fb-form">
      <div class="fb-seg" role="radiogroup" aria-label={he.feedback.kindLabel}>
        {(["improve", "keep"] as const).map((k) => (
          <button type="button" role="radio" aria-checked={kind === k} class={kind === k ? "on" : ""} onClick={() => setKind(k)}>
            {he.feedback[k]}
          </button>
        ))}
      </div>

      <label class="vh" for="fb-text">
        {he.feedback.textLabel}
      </label>
      <div class={`fb-box ${problem || clip ? "" : "has-mic"}`}>
        <textarea
          id="fb-text"
          class="fb-text"
          rows={4}
          maxLength={FEEDBACK_MAX_TEXT}
          placeholder={kind === "improve" ? he.feedback.placeholderImprove : he.feedback.placeholderKeep}
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        {!problem && !clip && (
          <div class="fb-mic-wrap">
            <span class="fb-mic-status" aria-live="polite">
              {recording ? <time class="num">{fmtClock(rec.seconds)}</time> : null}
            </span>
            <button
              type="button"
              class={`fb-mic ${recording ? "rec" : ""}`}
              aria-label={recording ? he.feedback.micStop : he.feedback.micStart}
              aria-pressed={recording}
              disabled={phase !== "edit"}
              onClick={rec.toggle}
            >
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
          </div>
        )}
      </div>
      {clip && (
        <div class="fb-clip" role="group" aria-label={he.feedback.recording}>
          <button
            type="button"
            class="fb-clip-play"
            aria-label={playing ? he.feedback.pauseRecording : he.feedback.playRecording}
            onClick={togglePlay}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <span class="fb-clip-label">
            <MicIcon size={16} />
            <span>{he.feedback.recording}</span>
            <time class="num muted">{fmtClock(clip.seconds)}</time>
          </span>
          <button
            type="button"
            class="fb-clip-x"
            aria-label={he.feedback.discardRecording}
            disabled={phase !== "edit"}
            onClick={dropClip}
          >
            <XIcon />
          </button>
        </div>
      )}
      {problem && <p class="note">{problem}</p>}
      {note && <p class="note gap">{note}</p>}

      <div class="fb-meta">
        {shot && shot !== "failed" && (
          <>
            <img src={shot.url} alt={he.feedback.shotAlt} class={keepShot ? "" : "off"} />
            <button type="button" class="lnk" aria-pressed={!keepShot} onClick={() => setKeepShot((v) => !v)}>
              {keepShot ? he.feedback.shotRemove : he.feedback.shotRestore}
            </button>
          </>
        )}
        <span class="small muted">{shot && shot !== "failed" && !keepShot ? he.feedback.shotRemoved : he.feedback.contextNote}</span>
      </div>
      {error && (
        <p class="note gap" role="alert">
          {error}
        </p>
      )}
      <button type="button" class="btn big fb-send" disabled={!canSend} onClick={send}>
        {phase === "sending" ? he.feedback.sending : he.feedback.send}
      </button>
    </div>
  );
}

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>
);

const MicIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
