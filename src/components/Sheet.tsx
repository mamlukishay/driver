/**
 * Bottom sheet driven by `?sheet=`; back (or Esc / scrim) closes it. Focus is trapped inside.
 * With `slide`, it slides up from below the screen and, on close, stays mounted (inert, with its
 * last title and content) while it slides back down, then unmounts on `animationend`.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { he } from "../i18n/he.ts";
import { useReturnFocus } from "../nav.ts";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Full-screen (e.g. the event edit form). */
  full?: boolean;
  /** Slide up from the bottom on open and back down on close (the ☰ menu). */
  slide?: boolean;
}

/** Fallback for a close animation whose `animationend` never fires (≈ the CSS duration + slack). */
const CLOSE_FALLBACK_MS = 300;

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

export function Sheet({ open, title, onClose, children, full, slide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // `slide` only: still mounted after `open` turned false, until the slide-down ends.
  const [lingering, setLingering] = useState(false);
  const last = useRef<{ title: string; children: ComponentChildren }>({ title, children });
  if (open) last.current = { title, children };
  const closing = !open && lingering;
  useLayoutEffect(() => {
    if (!slide) return;
    if (open) {
      setLingering(true);
      return;
    }
    if (!lingering) return;
    if (reducedMotion()) {
      setLingering(false);
      return;
    }
    const t = setTimeout(() => setLingering(false), CLOSE_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [open, slide, lingering]);
  useReturnFocus(open);
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (f.length === 0) return;
      const a = f[0]!;
      const z = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("noscroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("noscroll");
    };
  }, [open]);
  if (!open && !closing) return null;
  const onAnimationEnd = (e: AnimationEvent) => {
    if (closing && e.target === e.currentTarget) setLingering(false);
  };
  return (
    <div class={`ov${slide ? " slide" : ""}${closing ? " closing" : ""}`} inert={closing} aria-hidden={closing ? "true" : undefined}>
      <button type="button" class="scrim" aria-label={he.common.close} tabIndex={-1} onClick={onClose} />
      <div
        class={full ? "sheet full" : "sheet"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={closing ? undefined : "sheet-title"}
        ref={ref}
        onAnimationEnd={onAnimationEnd}
      >
        <span class="grab" aria-hidden="true" />
        <div class="row sp">
          <h2 id={closing ? undefined : "sheet-title"} class="sheet-t">
            {closing ? last.current.title : title}
          </h2>
          <button type="button" class="xbtn" onClick={onClose} aria-label={he.common.close}>
            ×
          </button>
        </div>
        {closing ? last.current.children : children}
      </div>
    </div>
  );
}

/** A sentence confirmation: the whole write spelled out, with the key words highlighted. */
export function ConfirmSentence({
  parts,
  note,
  confirm,
  onConfirm,
  onCancel,
  busy,
  danger,
}: {
  parts: (string | { b: string })[];
  note?: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <p class="sent">{parts.map((p) => (typeof p === "string" ? p : <b>{p.b}</b>))}</p>
      {note && <p class="small muted">{note}</p>}
      <div class="row">
        <button type="button" class={`btn grow1 ${danger ? "danger" : ""}`} onClick={onConfirm} disabled={busy} data-autofocus>
          {busy ? he.common.saving : confirm}
        </button>
        <button type="button" class="btn ghost" onClick={onCancel}>
          {he.common.cancel}
        </button>
      </div>
    </>
  );
}
