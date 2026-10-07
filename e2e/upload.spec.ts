import { expect, test } from "@playwright/test";
import { createGroup, expectImageLoaded, he, makePng, newUser, registerFamily, type User } from "./helpers.ts";

const FAMILY = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };
const png = { name: "test.png", mimeType: "image/png", buffer: makePng(96) };

let user: User;
let groupId: string;

test.beforeEach(async ({ browser }) => {
  user = await newUser(browser);
  ({ groupId } = await createGroup(user.page, "קבוצת תמונות"));
  await user.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(user.page, groupId, FAMILY);
});

test.afterEach(async () => {
  await user.ctx.close();
});

test("an invitation image uploaded on a new event renders", async () => {
  const { page } = user;
  await page.getByRole("link", { name: he.group.newEvent }).click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByLabel(he.newEvent.drop).setInputFiles(png);

  // Form step shows the cover preview (a blob URL of the resized JPEG).
  const preview = page.getByRole("img", { name: he.newEvent.cover });
  await expectImageLoaded(preview);
  await page.getByLabel(he.newEvent.fTitle, { exact: true }).fill("יום הולדת עם הזמנה");
  await page.getByLabel(he.newEvent.fPlace, { exact: true }).fill("הפארק");
  await page.getByRole("button", { name: he.newEvent.submit }).click();

  // The event header shows the uploaded image from the server (R2/DO), not the placeholder.
  await expect(page).toHaveURL(/\/e\/[a-z0-9-]+$/);
  const cover = page.getByRole("link", { name: he.event.inviteFull }).locator("img");
  await expectImageLoaded(cover);
  expect(await cover.getAttribute("src")).toContain(`/api/g/${groupId}/images/`);

  // Full-screen invite page.
  await page.getByRole("link", { name: he.event.inviteFull }).click();
  await expect(page).toHaveURL(/\/invite$/);
  await expectImageLoaded(page.getByRole("img", { name: new RegExp(he.invite.title) }));

  // The bytes the server stores are a real JPEG (downscaled client-side).
  const src = await page.getByRole("img", { name: new RegExp(he.invite.title) }).getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("image/");
});

test("a car photo uploaded in the profile renders and persists", async () => {
  const { page } = user;
  await page.goto(`/g/${groupId}/me`);
  await expect(page.getByRole("heading", { level: 1, name: he.profile.title })).toBeVisible();
  await page.getByRole("button", { name: he.form.addCar }).click();
  await page.getByLabel(he.form.carLabel).fill("סובארו כחולה");
  await page.locator("#car-0-photo").setInputFiles(png);

  // Instant preview in the form.
  await expect(page.getByRole("button", { name: he.common.save })).toBeEnabled();
  await expect(page.getByText(he.form.carPhotoReplace)).toBeVisible();
  const preview = page.getByRole("img", { name: "סובארו כחולה" });
  await expectImageLoaded(preview);

  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.profile.saved)).toBeVisible();

  // After a reload the photo comes from the server.
  await page.reload();
  const saved = page.getByRole("img", { name: "סובארו כחולה" });
  await expectImageLoaded(saved);
  expect(await saved.getAttribute("src")).toContain(`/api/g/${groupId}/images/`);
});
