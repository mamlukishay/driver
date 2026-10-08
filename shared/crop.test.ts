import { expect, test } from "bun:test";
import { CAR_ASPECT, MAX_ZOOM, centerCrop, clampCrop, cropRect, cropSize, outputSize, panCrop, zoomCrop } from "./crop.ts";

const A = CAR_ASPECT;

test("zoom 1 is the largest 3:2 rectangle inside the image", () => {
  expect(cropSize(3000, 4000, A, 1)).toEqual({ w: 3000, h: 2000 }); // portrait: full width
  expect(cropSize(4000, 2000, A, 1)).toEqual({ w: 3000, h: 2000 }); // wide: full height
  expect(cropSize(4000, 2000, A, 2)).toEqual({ w: 1500, h: 1000 });
});

test("the default crop is centered", () => {
  expect(cropRect(3000, 4000, A, centerCrop(3000, 4000))).toEqual({ x: 0, y: 1000, w: 3000, h: 2000 });
  expect(cropRect(4000, 2000, A, centerCrop(4000, 2000))).toEqual({ x: 500, y: 0, w: 3000, h: 2000 });
});

test("clamping keeps the rectangle inside the image and zoom in range", () => {
  expect(clampCrop(3000, 4000, A, { cx: -50, cy: 99999, zoom: 1 })).toEqual({ cx: 1500, cy: 3000, zoom: 1 });
  expect(clampCrop(3000, 4000, A, { cx: 0, cy: 0, zoom: 2 })).toEqual({ cx: 750, cy: 500, zoom: 2 });
  expect(clampCrop(100, 100, A, { cx: 50, cy: 50, zoom: 0.2 }).zoom).toBe(1);
  expect(clampCrop(100, 100, A, { cx: 50, cy: 50, zoom: 99 }).zoom).toBe(MAX_ZOOM);
  expect(clampCrop(100, 100, A, { cx: 50, cy: 50, zoom: Number.NaN }).zoom).toBe(1);
});

test("panning moves the crop opposite the drag, in frame pixels, and stops at the edges", () => {
  // Portrait 3000×4000, frame 300px wide → 10 source px per screen px.
  const c = centerCrop(3000, 4000);
  expect(panCrop(3000, 4000, A, c, 0, 50, 300)).toEqual({ cx: 1500, cy: 1500, zoom: 1 }); // drag down → see higher
  expect(panCrop(3000, 4000, A, c, 0, 500, 300)).toEqual({ cx: 1500, cy: 1000, zoom: 1 }); // top edge
  expect(panCrop(3000, 4000, A, c, 80, 0, 300)).toEqual({ cx: 1500, cy: 2000, zoom: 1 }); // no room sideways
});

test("zooming keeps the pivot point fixed, then clamps", () => {
  const c = centerCrop(3000, 4000);
  expect(zoomCrop(3000, 4000, A, c, 2)).toEqual({ cx: 1500, cy: 2000, zoom: 2 });
  // Zoom at the frame's top-left corner: that corner's source point (0, 1000) stays the corner.
  const z = zoomCrop(3000, 4000, A, c, 2, 0, 0);
  expect(cropRect(3000, 4000, A, z)).toEqual({ x: 0, y: 1000, w: 1500, h: 1000 });
  // Zooming back out clamps into the image.
  const out = zoomCrop(3000, 4000, A, { cx: 750, cy: 3500, zoom: 2 }, 1);
  expect(cropRect(3000, 4000, A, out)).toEqual({ x: 0, y: 2000, w: 3000, h: 2000 });
});

test("output size caps the long side", () => {
  expect(outputSize({ x: 0, y: 0, w: 3000, h: 2000 }, 800)).toEqual({ w: 800, h: 533 });
  expect(outputSize({ x: 0, y: 0, w: 300, h: 200 }, 800)).toEqual({ w: 300, h: 200 });
});
