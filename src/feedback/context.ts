/** Context attached to every feedback: where the user was, who they act as, and the device. */
import type { FeedbackContext, ScreenshotState } from "../../shared/feedback.ts";
import type { GroupResponse } from "../../shared/types.ts";
import { getIdentity } from "../identity.ts";
import { keys, peek } from "../store.ts";

declare const __APP_VERSION__: string;

export const appVersion = (): string => (typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev");

/** Group slug from `/g/:group…`, `/join/:group` or the legacy `/kid/:group/:token`. */
export function groupFromPath(path: string): string | undefined {
  const m = /^\/(?:g|join|kid)\/([^/?#]+)/.exec(path);
  return m?.[1];
}

export const isKidPath = (path: string) => /^\/g\/[^/]+\/kid\//.test(path) || path.startsWith("/kid/");

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
    const data = peek<GroupResponse>(keys.group(group));
    if (data) ctx.groupName = data.group.name;
    // The kid page has no family identity of its own; don't attribute it to the device's parent.
    const familyId = ctx.kidPage ? null : getIdentity(group);
    if (familyId) {
      ctx.familyId = familyId;
      const fam = data?.families.find((f) => f.id === familyId);
      if (fam) ctx.familyName = fam.name;
    }
  }
  return ctx;
}
