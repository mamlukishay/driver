/**
 * Crop math for the car-photo crop sheet (`src/components/PhotoCrop.tsx`). Everything is in the
 * source image's pixels, so it doesn't depend on how large the frame is drawn on screen.
 *
 * A crop is a rectangle of a fixed aspect (3:2 for car photos) inside the image: at zoom 1 it is
 * the largest such rectangle (the image "covers" the frame), and zoom z shrinks it by z. `cx`/`cy`
 * is its center; clamping keeps the rectangle inside the image, so the frame is always covered.
 */

export interface Crop {
  /** Center of the crop rectangle, in source pixels. */
  cx: number;
  cy: number;
  /** 1 = the largest rectangle that fits; up to MAX_ZOOM. */
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Car photos are stored 3:2 landscape. */
export const CAR_ASPECT = 3 / 2;
export const MAX_ZOOM = 4;

/** Size of the crop rectangle at `zoom` (zoom 1: the largest `aspect` rectangle inside the image). */
export function cropSize(iw: number, ih: number, aspect: number, zoom: number): { w: number; h: number } {
  const w = Math.min(iw, ih * aspect) / zoom;
  return { w, h: w / aspect };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps zoom in [1, MAX_ZOOM] and the rectangle inside the image (the image always covers the frame). */
export function clampCrop(iw: number, ih: number, aspect: number, c: Crop): Crop {
  const zoom = clamp(Number.isFinite(c.zoom) ? c.zoom : 1, 1, MAX_ZOOM);
  const { w, h } = cropSize(iw, ih, aspect, zoom);
  return { zoom, cx: clamp(c.cx, w / 2, iw - w / 2), cy: clamp(c.cy, h / 2, ih - h / 2) };
}

/** The default framing: centered, zoom 1. */
export function centerCrop(iw: number, ih: number): Crop {
  return { cx: iw / 2, cy: ih / 2, zoom: 1 };
}

/** The crop rectangle in source pixels (what gets drawn to the output canvas). */
export function cropRect(iw: number, ih: number, aspect: number, c: Crop): Rect {
  const k = clampCrop(iw, ih, aspect, c);
  const { w, h } = cropSize(iw, ih, aspect, k.zoom);
  return { x: k.cx - w / 2, y: k.cy - h / 2, w, h };
}

/**
 * Drags the image by (dx, dy) screen pixels on a frame `frameW` pixels wide: the image follows the
 * finger, so the crop center moves the other way.
 */
export function panCrop(iw: number, ih: number, aspect: number, c: Crop, dx: number, dy: number, frameW: number): Crop {
  const k = clampCrop(iw, ih, aspect, c);
  const perPx = cropSize(iw, ih, aspect, k.zoom).w / frameW;
  return clampCrop(iw, ih, aspect, { ...k, cx: k.cx - dx * perPx, cy: k.cy - dy * perPx });
}

/**
 * Sets the zoom, keeping the image point under the pivot (a point of the frame, as fractions
 * 0..1 of its width and height; default its center) where it is.
 */
export function zoomCrop(iw: number, ih: number, aspect: number, c: Crop, zoom: number, px = 0.5, py = 0.5): Crop {
  const k = clampCrop(iw, ih, aspect, c);
  const z = clamp(zoom, 1, MAX_ZOOM);
  const a = cropSize(iw, ih, aspect, k.zoom);
  const b = cropSize(iw, ih, aspect, z);
  // The source point under the pivot, before and after, stays put.
  const qx = k.cx + (px - 0.5) * a.w;
  const qy = k.cy + (py - 0.5) * a.h;
  return clampCrop(iw, ih, aspect, { zoom: z, cx: qx - (px - 0.5) * b.w, cy: qy - (py - 0.5) * b.h });
}

/** Output size for a crop rectangle: its own size, scaled down so the long side is at most `maxDim`. */
export function outputSize(r: Rect, maxDim: number): { w: number; h: number } {
  const s = Math.min(1, maxDim / Math.max(r.w, r.h));
  return { w: Math.max(1, Math.round(r.w * s)), h: Math.max(1, Math.round(r.h * s)) };
}
