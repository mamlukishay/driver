/** Global toast with an optional undo countdown (5 s). Undo calls POST /undo with the logId. */
import { useEffect, useState } from "preact/hooks";
import type { EventView } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { errorText, he } from "../i18n/he.ts";
import { keys, setData } from "../store.ts";
import { useForce } from "../util.ts";

const UNDO_MS = 5_000;

interface ToastState {
  id: number;
  text: string;
  kind: "info" | "warn";
  undo?: { group: string; event: string; logId: string };
  until: number;
}

let current: ToastState | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

function show(t: Omit<ToastState, "id" | "until">, ms: number) {
  clearTimeout(timer);
  current = { ...t, id: ++seq, until: Date.now() + ms };
  emit();
  timer = setTimeout(() => {
    current = null;
    emit();
  }, ms);
}

export const toast = {
  info: (text: string) => show({ text, kind: "info" }, 3500),
  error: (err: unknown) =>
    show({ text: errorText(err instanceof ApiError ? err.code : "unknown"), kind: "warn" }, 6000),
  warn: (text: string) => show({ text, kind: "warn" }, 5000),
  undoable: (text: string, undo: { group: string; event: string; logId: string }) =>
    show({ text, kind: "info", undo }, UNDO_MS),
  dismiss: () => {
    clearTimeout(timer);
    current = null;
    emit();
  },
};

export function ToastHost() {
  const force = useForce();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    subs.add(force);
    return () => void subs.delete(force);
  }, []);
  const t = current;
  // Re-render once a second for the countdown.
  useEffect(() => {
    if (!t?.undo) return;
    const i = setInterval(force, 1000);
    return () => clearInterval(i);
  }, [t?.id]);
  if (!t) return <div class="toast-live" aria-live="polite" />;

  const left = Math.max(0, Math.ceil((t.until - Date.now()) / 1000));
  const doUndo = async () => {
    if (!t.undo || busy) return;
    setBusy(true);
    try {
      const r = await api.undo(t.undo.group, t.undo.event, t.undo.logId);
      setData<EventView>(keys.event(t.undo.group, t.undo.event), r.event);
      toast.info(he.toast.undone);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="toast-live" aria-live="polite">
      <div class={`toast ${t.kind === "warn" ? "warn" : ""}`} role="status" key={t.id}>
        <span>{t.text}</span>
        {t.undo && (
          <button type="button" onClick={doUndo} disabled={busy}>
            {he.common.undo} <span class="num">· {he.toast.undoIn(left)}</span>
          </button>
        )}
        {!t.undo && (
          <button type="button" class="tx" onClick={toast.dismiss} aria-label={he.common.close}>
            ×
          </button>
        )}
        {t.undo && <i class="tbar" aria-hidden="true" />}
      </div>
    </div>
  );
}
