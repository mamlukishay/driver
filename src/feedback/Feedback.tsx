/**
 * Floating "משוב" button (every screen, above sheets) + the `?sheet=feedback` sheet.
 * Pressing the button first captures a screenshot of what the user sees, then opens the sheet.
 */
import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FeedbackKind, ScreenshotState } from "../../shared/feedback.ts";
import { FEEDBACK_MAX_TEXT } from "../../shared/feedback.ts";
import { Sheet } from "../components/Sheet.tsx";
import { he } from "../i18n/he.ts";
import { useSheet } from "../nav.ts";
import { feedbackApi } from "./api.ts";
import { captureViewport } from "./capture.ts";
import { collectContext, isKidPath } from "./context.ts";
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
          class={`fb-fab ${isKidPath(path) ? "kid" : ""}`}
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

function FeedbackForm({ path, shot, onDone }: { path: string; shot: Shot | "failed" | null; onDone: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("improve");
  const [text, setText] = useState("");
  const [audioId, setAudioId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [keepShot, setKeepShot] = useState(true);
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  const rec = useRecorder(async (blob) => {
    setTranscribing(true);
    setNote(null);
    try {
      const r = await feedbackApi.audio(blob);
      setAudioId(r.audioId);
      if (r.transcript) {
        setTranscript((t) => (t ? `${t}\n${r.transcript}` : r.transcript));
        setText((t) => (t.trim() ? `${t.trimEnd()}\n${r.transcript}` : r.transcript!).slice(0, FEEDBACK_MAX_TEXT));
      } else setNote(he.feedback.transcribeFailed);
    } catch {
      setNote(he.feedback.uploadFailed);
    } finally {
      setTranscribing(false);
    }
  });

  const recording = rec.state === "recording";
  const canSend = phase === "edit" && !recording && !transcribing && (text.trim() !== "" || audioId !== null);

  const send = async () => {
    if (!canSend) return;
    setPhase("sending");
    setError(null);
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
        ...(audioId ? { audioId } : {}),
        ...(transcript ? { transcript } : {}),
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
      <div class={`fb-box ${problem ? "" : "has-mic"}`}>
        <textarea
          id="fb-text"
          class="fb-text"
          rows={4}
          maxLength={FEEDBACK_MAX_TEXT}
          placeholder={kind === "improve" ? he.feedback.placeholderImprove : he.feedback.placeholderKeep}
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        {!problem && (
          <div class="fb-mic-wrap">
            <span class="fb-mic-status" aria-live="polite">
              {recording ? (
                <time class="num">{fmtClock(rec.seconds)}</time>
              ) : transcribing ? (
                he.feedback.transcribing
              ) : audioId ? (
                <>🎙️ {he.feedback.audioAttached}</>
              ) : null}
            </span>
            <button
              type="button"
              class={`fb-mic ${recording ? "rec" : ""}`}
              aria-label={recording ? he.feedback.micStop : he.feedback.micStart}
              aria-pressed={recording}
              disabled={transcribing || phase !== "edit"}
              onClick={rec.toggle}
            >
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
          </div>
        )}
      </div>
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

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
  </svg>
);
