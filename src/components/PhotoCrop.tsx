/**
 * Car-photo crop: the picked image under a fixed 3:2 frame. Drag to move it (pointer events: touch
 * and mouse), pinch / wheel / the slider to zoom; "בחירה" renders the framed part to a JPEG
 * (long side ≤ maxDim, ≤ MAX_IMAGE_BYTES). The math lives in `shared/crop.ts`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { CAR_ASPECT, MAX_ZOOM, centerCrop, cropRect, panCrop, zoomCrop, type Crop } from "../../shared/crop.ts";
import { he } from "../i18n/he.ts";
import { encodeJpeg, loadImage, type LoadedImage } from "./ImagePicker.tsx";

/** Space around the frame where the rest of the image shows, dimmed (CSS px). */
const MARGIN_X = 14;
const MARGIN_Y = 26;

interface Props {
  file: Blob;
  maxDim: number;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
  aspect?: number;
}

export function PhotoCrop({ file, maxDim, onDone, onCancel, aspect = CAR_ASPECT }: Props) {
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stageW, setStageW] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    let live = true;
    let loaded: LoadedImage | null = null;
    loadImage(file).then(
      (i) => {
        loaded = i;
        if (!live) return;
        setImg(i);
        setCrop(centerCrop(i.width, i.height));
      },
      () => live && setErr(he.image.failed),
    );
    return () => {
      live = false;
      if (loaded?.source instanceof ImageBitmap) loaded.source.close();
    };
  }, [file]);

  // The stage is as wide as the sheet; follow it (rotation, resize).
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setStageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameW = Math.max(1, stageW - 2 * MARGIN_X);
  const frameH = frameW / aspect;
  const stageH = Math.round(frameH + 2 * MARGIN_Y);

  // Draw: the whole image placed so the crop rectangle lands on the frame, dimmed outside it.
  useLayoutEffect(() => {
    const cv = canvas.current;
    if (!cv || !img || !crop || stageW === 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(stageW * dpr);
    cv.height = Math.round(stageH * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stageW, stageH);
    const r = cropRect(img.width, img.height, aspect, crop);
    const s = frameW / r.w;
    ctx.drawImage(img.source, MARGIN_X - r.x * s, MARGIN_Y - r.y * s, img.width * s, img.height * s);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.rect(0, 0, stageW, stageH);
    ctx.rect(MARGIN_X, MARGIN_Y, frameW, frameH);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN_X, MARGIN_Y, frameW, frameH);
  }, [img, crop, stageW]);

  const set = (f: (c: Crop, w: number, h: number) => Crop) => setCrop((c) => (c && img ? f(c, img.width, img.height) : c));

  /** A stage point as fractions of the frame (the zoom pivot). */
  const pivot = (x: number, y: number) => {
    const b = stage.current!.getBoundingClientRect();
    return [(x - b.left - MARGIN_X) / frameW, (y - b.top - MARGIN_Y) / frameH] as const;
  };

  const onDown = (e: PointerEvent) => {
    if (!img) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: PointerEvent) => {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    const before = [...ps.values()];
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...ps.values()];
    if (after.length === 1) {
      set((c, w, h) => panCrop(w, h, aspect, c, e.clientX - prev.x, e.clientY - prev.y, frameW));
      return;
    }
    // Pinch: the first two pointers; zoom by the change in their distance around their midpoint,
    // and pan by the midpoint's move.
    const [a0, b0] = before as [{ x: number; y: number }, { x: number; y: number }];
    const [a1, b1] = after as [{ x: number; y: number }, { x: number; y: number }];
    const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
    const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const [px, py] = pivot(m1.x, m1.y);
    set((c, w, h) => {
      const z = d0 > 0 ? zoomCrop(w, h, aspect, c, c.zoom * (d1 / d0), px, py) : c;
      return panCrop(w, h, aspect, z, m1.x - m0.x, m1.y - m0.y, frameW);
    });
  };
  const onUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };
  const onWheel = (e: WheelEvent) => {
    if (!img) return;
    e.preventDefault();
    const [px, py] = pivot(e.clientX, e.clientY);
    set((c, w, h) => zoomCrop(w, h, aspect, c, c.zoom * Math.exp(-e.deltaY * 0.002), px, py));
  };

  const confirm = async () => {
    if (!img || !crop || busy) return;
    setBusy(true);
    setErr(null);
    try {
      onDone(await encodeJpeg(img, cropRect(img.width, img.height, aspect, crop), maxDim));
    } catch (e) {
      setErr(e instanceof Error && e.message === "too_large" ? he.image.tooBig : he.image.failed);
      setBusy(false);
    }
  };

  return (
    <div class="crop">
      <p class="small muted">{he.crop.hint}</p>
      <div
        ref={stage}
        class="crop-stage"
        style={{ blockSize: `${stageH}px` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
      >
        <canvas ref={canvas} role="img" aria-label={he.crop.frame} style={{ inlineSize: `${stageW}px`, blockSize: `${stageH}px` }} />
        {!img && !err && <span class="crop-wait">{he.image.processing}</span>}
      </div>
      <label class="crop-zoom">
        <span class="small">{he.crop.zoom}</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop?.zoom ?? 1}
          disabled={!img}
          onInput={(e) => {
            const z = Number((e.currentTarget as HTMLInputElement).value);
            set((c, w, h) => zoomCrop(w, h, aspect, c, z));
          }}
        />
      </label>
      {err && (
        <p class="note" role="alert">
          {err}
        </p>
      )}
      <div class="row">
        <button type="button" class="btn grow1" onClick={confirm} disabled={!img || busy} data-autofocus>
          {busy ? he.image.processing : he.crop.confirm}
        </button>
        <button type="button" class="btn ghost" onClick={onCancel}>
          {he.common.cancel}
        </button>
      </div>
    </div>
  );
}
