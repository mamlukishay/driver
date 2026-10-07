import { expect, test, type Page } from "@playwright/test";
import type { FeedbackAudioResponse, FeedbackInput, FeedbackResponse } from "../shared/feedback.ts";
import { apiGroup, createGroup, familyIdOf, he, newUser, registerFamily, soloScene, type User } from "./helpers.ts";

const FAMILY = { name: "לוי", parent: "דנה", phone: "052-333-4444", kid: "איתי" };

/** Fake mic: getUserMedia resolves a silent stream; MediaRecorder emits a tiny "webm" blob on stop. */
async function mockMic(page: Page, mode: "ok" | "denied" = "ok") {
  await page.addInitScript((m) => {
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
    md.getUserMedia = async () => {
      if (m === "denied") throw new DOMException("denied", "NotAllowedError");
      return new MediaStream();
    };
    class FakeRecorder {
      static isTypeSupported = (t: string) => t.startsWith("audio/webm");
      state: "inactive" | "recording" = "inactive";
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_s: MediaStream, o?: { mimeType?: string }) {
        this.mimeType = o?.mimeType ?? "audio/webm";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]);
        this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) });
        setTimeout(() => this.onstop?.(), 0);
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  }, mode);
}

const fab = (page: Page) => page.getByRole("button", { name: he.feedback.buttonLabel });

let user: User | undefined;

test.afterEach(async () => {
  await user?.ctx.close();
  user = undefined;
});

test("feedback with voice + screenshot from the group home", async ({ browser }) => {
  user = await newUser(browser);
  const page = user.page;
  await mockMic(page);
  const { groupId } = await createGroup(page, "קבוצת משוב");
  await page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(page, groupId, FAMILY);

  await fab(page).click();
  await expect(page).toHaveURL(/[?&]sheet=feedback/);
  const dialog = page.getByRole("dialog", { name: he.feedback.title });
  await expect(dialog).toBeVisible();
  // The floating button hides while its own sheet is open, and the screenshot thumbnail is shown.
  await expect(fab(page)).toBeHidden();
  const thumb = dialog.getByRole("img", { name: he.feedback.shotAlt });
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByText(he.feedback.contextNote)).toBeVisible();

  // Kind toggle: default "improve", switch to "keep".
  const improve = dialog.getByRole("radio", { name: he.feedback.improve });
  const keep = dialog.getByRole("radio", { name: he.feedback.keep });
  await expect(improve).toHaveAttribute("aria-checked", "true");
  const send = dialog.getByRole("button", { name: he.feedback.send });
  await expect(send).toBeDisabled();
  await keep.click();
  await expect(keep).toHaveAttribute("aria-checked", "true");

  // Record → stop → upload in the background; the form shows a recording box (no transcript, text untouched).
  await dialog.getByRole("button", { name: he.feedback.micStart }).click();
  await expect(dialog.getByText("00:00")).toBeVisible();
  const audioRes = page.waitForResponse((r) => r.url().endsWith("/api/feedback/audio") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: he.feedback.micStop }).click();
  const audio = (await (await audioRes).json()) as FeedbackAudioResponse;
  expect(audio.audioId).toMatch(/^[a-z0-9]+$/);
  expect(audio.transcript).toBeNull();
  const clip = dialog.getByRole("group", { name: he.feedback.recording });
  await expect(clip).toBeVisible();
  await expect(clip.getByRole("button", { name: he.feedback.playRecording })).toBeVisible();
  await expect(clip.getByRole("button", { name: he.feedback.discardRecording })).toBeVisible();
  await expect(clip.getByText("00:00")).toBeVisible();
  await expect(dialog.getByLabel(he.feedback.textLabel)).toHaveValue("");
  // One recording at a time: the mic hides until the recording is discarded.
  await expect(dialog.getByRole("button", { name: he.feedback.micStart })).toBeHidden();
  // Audio alone is enough to send.
  await expect(send).toBeEnabled();

  await dialog.getByLabel(he.feedback.textLabel).fill("הלוח ממש ברור, תודה!");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
  const sentRes = page.waitForResponse((r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST");
  await send.click();
  const payload = (await sent).postDataJSON() as FeedbackInput;
  const res = (await (await sentRes).json()) as FeedbackResponse;

  expect(payload.kind).toBe("keep");
  expect(payload.text).toBe("הלוח ממש ברור, תודה!");
  expect(payload.audioId).toBe(audio.audioId);
  expect(payload.screenshotId).toMatch(/^[a-z0-9]+$/);
  expect(payload.context).toMatchObject({
    path: `/g/${groupId}`,
    groupId,
    familyName: FAMILY.name,
    kidPage: false,
    screenshot: "attached",
    viewport: expect.stringContaining("390×844"),
  });
  expect(payload.context.familyId).toBeTruthy();
  expect(payload.context.appVersion).toBeTruthy();
  expect(payload.context.userAgent).toContain("Mozilla");
  expect(res.ok).toBe(true);
  expect(res.id).toMatch(/^[a-z0-9]+$/);

  await expect(page.getByRole("status").filter({ hasText: he.feedback.thanks })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/sheet=/);
  await expect(fab(page)).toBeVisible();

  // Stored blobs are served back with their content type.
  const shot = await page.request.get(`/api/feedback/screenshot/${payload.screenshotId}`);
  expect(shot.ok()).toBe(true);
  expect(shot.headers()["content-type"]).toBe("image/jpeg");
  expect((await shot.body()).byteLength).toBeLessThanOrEqual(400 * 1024);
  const rec = await page.request.get(`/api/feedback/audio/${audio.audioId}`);
  expect(rec.ok()).toBe(true);
  expect(rec.headers()["content-type"]).toBe("audio/webm");
});

test("discarding the recording restores the mic and sends no audio", async ({ browser }) => {
  user = await newUser(browser);
  const page = user.page;
  await mockMic(page);
  await page.goto("/");
  await fab(page).click();
  const dialog = page.getByRole("dialog", { name: he.feedback.title });
  await expect(dialog).toBeVisible();

  const audioRes = page.waitForResponse((r) => r.url().endsWith("/api/feedback/audio") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: he.feedback.micStart }).click();
  await dialog.getByRole("button", { name: he.feedback.micStop }).click();
  const clip = dialog.getByRole("group", { name: he.feedback.recording });
  await expect(clip).toBeVisible();
  await audioRes;
  const send = dialog.getByRole("button", { name: he.feedback.send });
  await expect(send).toBeEnabled();

  await clip.getByRole("button", { name: he.feedback.discardRecording }).click();
  await expect(clip).toBeHidden();
  await expect(dialog.getByRole("button", { name: he.feedback.micStart })).toBeVisible();
  await expect(send).toBeDisabled();

  await dialog.getByLabel(he.feedback.textLabel).fill("רק טקסט");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
  await send.click();
  const payload = (await sent).postDataJSON() as FeedbackInput;
  expect(payload.text).toBe("רק טקסט");
  expect(payload.audioId).toBeUndefined();
  expect(payload.transcript).toBeUndefined();
  await expect(page.getByText(he.feedback.thanks)).toBeVisible();
});

test("mic denied falls back to text; removing the screenshot; back closes the sheet", async ({ browser }) => {
  user = await newUser(browser);
  const page = user.page;
  await mockMic(page, "denied");
  await page.goto("/");
  await fab(page).click();
  const dialog = page.getByRole("dialog", { name: he.feedback.title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: he.feedback.micStart }).click();
  await expect(dialog.getByText(he.feedback.micDenied)).toBeVisible();
  await expect(dialog.getByRole("button", { name: he.feedback.micStart })).toBeHidden();

  // Back closes the sheet without sending.
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/sheet=/);

  await fab(page).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: he.feedback.shotRemove }).click();
  await expect(dialog.getByText(he.feedback.shotRemoved)).toBeVisible();
  await dialog.getByLabel(he.feedback.textLabel).fill("כפתור קטן מדי");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
  await dialog.getByRole("button", { name: he.feedback.send }).click();
  const payload = (await sent).postDataJSON() as FeedbackInput;
  expect(payload.kind).toBe("improve");
  expect(payload.screenshotId).toBeUndefined();
  expect(payload.audioId).toBeUndefined();
  expect(payload.context.screenshot).toBe("removed");
  expect(payload.context.path).toBe("/");
  await expect(page.getByText(he.feedback.thanks)).toBeVisible();
});

test("button floats over other sheets and on the kid page (smaller, no family attribution)", async ({ browser }) => {
  user = await newUser(browser);
  const page = user.page;
  const scene = await soloScene(page, { ...FAMILY, car: { label: "סובארו", seats: 4 } }, "קבוצת כפתור", "יום ספורט");

  // Over another sheet (offer a car on the board): still visible and on top.
  await page.goto(`${scene.eventUrl}/out`);
  await page.getByRole("button", { name: he.board.offer("out") }).click();
  await expect(page).toHaveURL(/sheet=car/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(fab(page)).toBeVisible();
  const onTop = await fab(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(onTop).toBe(true);
  const fullHeight = (await fab(page).boundingBox())!.height;

  // Kid page: smaller button; feedback is not attributed to the device's family.
  const group = await apiGroup(page, scene.groupId, await familyIdOf(page, scene.groupId));
  const kidId = group.me!.kids[0]!.id;
  await page.goto(`/g/${scene.groupId}/kid/${kidId}`);
  await expect(fab(page)).toBeVisible();
  expect((await fab(page).boundingBox())!.height).toBeLessThan(fullHeight);
  await fab(page).click();
  const dialog = page.getByRole("dialog", { name: he.feedback.title });
  await dialog.getByLabel(he.feedback.textLabel).fill("לא רואים את הנהג");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
  await dialog.getByRole("button", { name: he.feedback.send }).click();
  const payload = (await sent).postDataJSON() as FeedbackInput;
  expect(payload.context).toMatchObject({ kidPage: true, groupId: scene.groupId });
  expect(payload.context.familyId).toBeUndefined();
  await expect(page.getByText(he.feedback.thanks)).toBeVisible();
});

test("API rejects bad feedback and oversized audio", async ({ request, baseURL }) => {
  const base = baseURL!;
  const bad = await request.post(`${base}/api/feedback`, { data: { kind: "improve", text: "" } });
  expect(bad.status()).toBe(400);
  const badKind = await request.post(`${base}/api/feedback`, { data: { kind: "x", text: "hi" } });
  expect(badKind.status()).toBe(400);
  const badMime = await request.post(`${base}/api/feedback/audio`, { data: "abc", headers: { "content-type": "text/plain" } });
  expect(badMime.status()).toBe(400);
  const big = await request.post(`${base}/api/feedback/audio`, {
    data: Buffer.alloc(3 * 1024 * 1024 + 10),
    headers: { "content-type": "audio/webm" },
  });
  expect(big.status()).toBe(413);
  const missing = await request.get(`${base}/api/feedback/audio/nosuchid23456`);
  expect(missing.status()).toBe(404);
});
