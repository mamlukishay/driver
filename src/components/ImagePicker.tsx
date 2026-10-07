/** File picker + drop zone that downsizes on a canvas to JPEG (≤ MAX_IMAGE_BYTES) before upload. */
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { MAX_IMAGE_BYTES } from "../../shared/types.ts";
import { he } from "../i18n/he.ts";
import { cx } from "../util.ts";

export async function downscale(file: Blob, maxDim: number): Promise<Blob> {
  const img = await loadImage(file);
  let scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  for (let round = 0; round < 4; round++) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img.source, 0, 0, w, h);
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
    scale *= 0.75;
  }
  throw new Error("too_large");
}

async function loadImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

interface Props {
  id: string;
  maxDim: number;
  onPicked: (blob: Blob) => void;
  /** Drop zone look (invite) vs. a small button (car photo). */
  variant: "drop" | "button";
  children: ComponentChildren;
  sub?: ComponentChildren;
  /** Slim one-line drop zone, for when the picker is optional. */
  compact?: boolean;
  /** Drop variant only: a "paste" button beside the zone that reads an image from the clipboard on tap. */
  paste?: boolean;
}

/** Reading images from the clipboard needs the async Clipboard API's `read()` (not just `readText()`). */
const canReadClipboard = () => typeof navigator !== "undefined" && !!navigator.clipboard && "read" in navigator.clipboard;

export function ImagePicker({ id, maxDim, onPicked, variant, children, sub, compact, paste }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = async (file: Blob | undefined | null) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      onPicked(await downscale(file, maxDim));
    } catch (e) {
      setErr(e instanceof Error && e.message === "too_large" ? he.image.tooBig : he.image.failed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const onPaste = () => {
    if (busy) return;
    setErr(null);
    // read() must be called synchronously inside the tap, or iOS Safari drops the user gesture.
    let reading: Promise<ClipboardItems>;
    try {
      reading = navigator.clipboard.read();
    } catch {
      setErr(he.newEvent.pasteDenied);
      return;
    }
    reading.then(
      async (items) => {
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          setBusy(true);
          let blob: Blob;
          try {
            blob = await item.getType(type);
          } catch {
            setBusy(false);
            setErr(he.image.failed);
            return;
          }
          return handle(blob);
        }
        setErr(he.newEvent.pasteEmpty);
      },
      () => setErr(he.newEvent.pasteDenied),
    );
  };

  const fileInput = (
    <input
      ref={input}
      id={id}
      type="file"
      accept="image/*"
      class="vh"
      onChange={(e) => handle((e.currentTarget as HTMLInputElement).files?.[0])}
    />
  );

  if (variant === "button")
    return (
      <div class="imgpick">
        <label class={cx("mini", busy && "busy")} for={id}>
          {busy ? he.image.processing : children}
        </label>
        {fileInput}
        {err && <span class="hint bad">{err}</span>}
      </div>
    );

  const zone = (
    <label
      class={cx("drop", compact && "compact", over && "over")}
      for={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer?.files?.[0]);
      }}
    >
      <svg class="ic" width={compact ? 24 : 34} height={compact ? 24 : 34} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {compact ? (
        <span class="drop-t">
          {busy ? <b>{he.image.processing}</b> : children}
          {sub}
        </span>
      ) : (
        <>
          {busy ? <b>{he.image.processing}</b> : children}
          {sub}
        </>
      )}
      {fileInput}
    </label>
  );

  return (
    <div>
      {paste && canReadClipboard() ? (
        <div class="drop-row">
          {zone}
          <button type="button" class={cx("drop paste", compact && "compact")} aria-label={he.newEvent.paste} disabled={busy} onClick={onPaste}>
            <svg class="ic" width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a1 1 0 011-1h4a1 1 0 011 1v1a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zm0 8h6m-6 4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="small">{he.newEvent.pasteShort}</span>
          </button>
        </div>
      ) : (
        zone
      )}
      {err && <p class="note gap">{err}</p>}
    </div>
  );
}
