/**
 * A photo you can tap to see full screen (car photos: the cars form, the board, the kid page).
 * The viewer is a sheet in `?sheet=photo&photo=<key>`, so back (or Esc, the ×, or a tap anywhere)
 * closes it, like every other sheet.
 */
import { useEffect, useRef } from "preact/hooks";
import { he } from "../i18n/he.ts";
import { useReturnFocus, useSheet } from "../nav.ts";
import { cx } from "../util.ts";

export const PHOTO_SHEET = "photo";

interface Props {
  /** Unique on the page (e.g. the offer id, `car-0`): which photo `?photo=` opens. */
  photoKey: string;
  src: string;
  alt: string;
  /** Class of the button (sizes the thumbnail). */
  class?: string;
  imgClass?: string;
  lazy?: boolean;
}

export function ZoomPhoto({ photoKey, src, alt, class: cls, imgClass, lazy }: Props) {
  const sheet = useSheet();
  const open = sheet.name === PHOTO_SHEET && sheet.query.photo === photoKey;
  return (
    <>
      <button type="button" class={cx("zoomph", cls)} aria-label={he.photo.open(alt)} onClick={() => sheet.open(PHOTO_SHEET, { photo: photoKey })}>
        <img class={imgClass} src={src} alt={alt} loading={lazy ? "lazy" : undefined} />
      </button>
      <PhotoViewer open={open} src={src} alt={alt} onClose={sheet.close} />
    </>
  );
}

export function PhotoViewer({ open, src, alt, onClose }: { open: boolean; src: string; alt: string; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useReturnFocus(open);
  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the close button is focusable: keep Tab on it.
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        if (e.key === "Escape") onClose();
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
    <div class="pv" role="dialog" aria-modal="true" aria-label={alt || he.photo.title} onClick={onClose}>
      <img class="pv-img" src={src} alt={alt} />
      <button
        type="button"
        class="pv-x"
        ref={closeBtn}
        aria-label={he.common.close}
        onClick={(e) => {
          e.stopPropagation(); // the backdrop's click would close it a second time
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
