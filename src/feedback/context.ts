/** Context attached to every feedback: where the user was, who they act as, and the device. */
import type { FeedbackContext, ScreenshotState } from "../../shared/feedback.ts";
import { getIdentity } from "../identity.ts";

declare const __APP_VERSION__: string;

export const appVersion = (): string => (typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev");

/** Group id from `/g/:group…`, `/join/:group` or `/kid/:group/:token`. */
export function groupFromPath(path: string): string | undefined {
  const m = /^\/(?:g|join|kid)\/([^/?#]+)/.exec(path);
  return m?.[1];
}

export const isKidPath = (path: string) => path.startsWith("/kid/");

export function collectContext(path: string, screenshot: ScreenshotState): FeedbackContext {
  const now = new Date();
  const ctx: FeedbackContext = {
    path,
    kidPage: isKidPath(path),
    appVersion: appVersion(),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio || 1}`,
    time: now.toISOString(),
    localTime: now.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full", timeStyle: "short" }),
    lang: navigator.language,
    screenshot,
  };
  const group = groupFromPath(path);
  if (group) {
    ctx.groupId = group;
    // The kid page has no family identity of its own; don't attribute it to the device's parent.
    const id = ctx.kidPage ? null : getIdentity(group);
    if (id) {
      ctx.familyId = id.familyId;
      ctx.familyName = id.familyName;
      if (id.groupName) ctx.groupName = id.groupName;
    } else {
      const g = getIdentity(group)?.groupName;
      if (g) ctx.groupName = g;
    }
  }
  return ctx;
}
