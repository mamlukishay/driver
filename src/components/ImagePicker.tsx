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
}

export function ImagePicker({ id, maxDim, onPicked, variant, children, sub, compact }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = async (file: File | undefined | null) => {
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

  return (
    <div>
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
      {err && <p class="note gap">{err}</p>}
    </div>
  );
}
