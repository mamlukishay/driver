/**
 * Screenshot of what the user sees right now (viewport only, current scroll), as a JPEG ≤ ~400 KB.
 * DOM-to-image via `modern-screenshot`, lazy-loaded so it stays out of the main bundle.
 * Never throws: returns null when capture isn't possible (old browser, tainted canvas, timeout).
 */

const TARGET_BYTES = 400 * 1024;
const CAPTURE_TIMEOUT_MS = 6000;

const toBlob = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", quality));

function downscale(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * factor));
  c.height = Math.max(1, Math.round(src.height * factor));
  c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Elements carrying `data-feedback-ignore` (the feedback button itself) are left out. */
const keep = (n: Node) => !(n instanceof Element && n.hasAttribute("data-feedback-ignore"));

async function capture(): Promise<Blob | null> {
  const { domToCanvas } = await import("modern-screenshot");
  const body = document.body;
  const bg = getComputedStyle(body).backgroundColor || getComputedStyle(document.documentElement).backgroundColor;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = await domToCanvas(body, {
    width: w,
    height: h,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    backgroundColor: bg,
    filter: keep,
    timeout: 3000,
    // Shift the flow content so the clone starts at the current scroll position; fixed overlays (sheets,
    // toasts) stay where they are on screen.
    style: { marginTop: `${-window.scrollY}px`, overflow: "visible" },
  });
  let c = canvas;
  let blob = await toBlob(c, 0.7);
  for (let i = 0; blob && blob.size > TARGET_BYTES && i < 4; i++) {
    c = downscale(c, 0.75);
    blob = await toBlob(c, 0.65);
  }
  return blob && blob.size <= TARGET_BYTES ? blob : null;
}

export async function captureViewport(): Promise<Blob | null> {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS));
    return await Promise.race([capture(), timeout]);
  } catch (e) {
    console.warn("feedback: screenshot failed", e);
    return null;
  }
}
