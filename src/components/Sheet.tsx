/** Bottom sheet driven by `?sheet=`; back (or Esc / scrim) closes it. Focus is trapped inside. */
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { he } from "../i18n/he.ts";
import { useReturnFocus } from "../nav.ts";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

export function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
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
  if (!open) return null;
  return (
    <div class="ov">
      <button type="button" class="scrim" aria-label={he.common.close} tabIndex={-1} onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={ref}>
        <span class="grab" aria-hidden="true" />
        <div class="row sp">
          <h2 id="sheet-title" class="sheet-t">
            {title}
          </h2>
          <button type="button" class="xbtn" onClick={onClose} aria-label={he.common.close}>
            ×
          </button>
        </div>
        {children}
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
