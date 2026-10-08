import { expect, test } from "@playwright/test";
import { apiGroup, createEventManually, createGroup, expectImageLoaded, familyIdOf, he, makePng, newUser, registerFamily, rsvpBothLegs, type User } from "./helpers.ts";

const FAMILY = { name: "לוי", parent: "דנה", phone: "052-222-3333", kid: "יואב" };

let user: User;
test.afterEach(async () => {
  await user.ctx.close();
});

test("cars live on their own page: board link → add, save, profile summary, profile save keeps the car", async ({ browser }) => {
  user = await newUser(browser);
  const { page } = user;
  const { groupId } = await createGroup(page, "קבוצת רכבים");
  await page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(page, groupId, FAMILY);
  const eventId = await createEventManually(page, groupId, "אימון");
  await rsvpBothLegs(page);

  // No car yet: the board links to the cars page with a new card, its label field focused.
  await page.goto(`/g/${groupId}/e/${eventId}/out`);
  await expect(page.getByText(he.board.noCar)).toBeVisible();
  await page.getByRole("link", { name: he.board.addCarLink }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/me/cars$`));
  await expect(page.getByRole("heading", { level: 1, name: he.cars.title })).toBeVisible();
  await expect(page.locator("#car-0-label")).toBeFocused();

  // A car without a label doesn't save.
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.form.requiredField)).toBeVisible();
  await expect(page.locator("#car-0-label")).toBeFocused();

  await page.locator("#car-0-label").fill("טויוטה לבנה");
  await page.getByRole("button", { name: he.form.less }).click();
  await page.locator("#car-0-plate").fill("45");
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.cars.saved)).toBeVisible();

  // After a reload it's there (once: `?add=1` was dropped from the URL).
  await page.reload();
  await expect(page.locator("#car-0-label")).toHaveValue("טויוטה לבנה");
  await expect(page.locator("#car-0-seats")).toHaveCount(1);
  await expect(page.locator("#car-1-label")).toHaveCount(0);

  // The family page: no car fields, a summary card and "ניהול הרכבים".
  await page.goto(`/g/${groupId}/me`);
  await expect(page.getByRole("heading", { level: 1, name: he.profile.title })).toBeVisible();
  await expect(page.getByLabel(he.form.carLabel)).toHaveCount(0);
  const summary = page.getByRole("region", { name: he.cars.summary });
  await expect(summary).toContainText("טויוטה לבנה");
  await expect(summary).toContainText(he.cars.seats(3));
  await expect(summary).toContainText("45");

  // Saving the profile keeps the car.
  // A street without a city is not saved (navigation could land in another town).
  await page.getByLabel(he.form.street).fill("הנשיא 5");
  await page.getByLabel(he.form.city).fill("");
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.form.fixErrors)).toBeVisible();
  await expect(page.getByLabel(he.form.city)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel(he.form.city)).toBeFocused();
  await expect(page.getByText(he.profile.saved)).toHaveCount(0);
  await page.getByLabel(he.form.city).fill("חיפה");
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.profile.saved)).toBeVisible();
  const g = await apiGroup(page, groupId, await familyIdOf(page, groupId));
  expect(g.me?.address).toBe("הנשיא 5");
  expect(g.me?.city).toBe("חיפה");
  expect(g.me?.cars.map((c) => [c.label, c.seats, c.plate])).toEqual([["טויוטה לבנה", 3, "45"]]);

  await summary.getByRole("link", { name: he.cars.manage }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/me/cars$`));
  await expect(page.locator("#car-0-label")).toHaveValue("טויוטה לבנה");

  // Up goes to the group home.
  await page.getByRole("button", { name: he.common.back }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/g/${groupId}`);

  // With a car, the board offers a ride instead of the link.
  await page.goto(`/g/${groupId}/e/${eventId}/out`);
  await expect(page.getByRole("button", { name: he.board.offer("out") })).toBeVisible();
  await expect(page.getByText(he.board.noCar)).toHaveCount(0);
});

test("the family page with no cars shows the hint; removing a car on the cars page saves", async ({ browser }) => {
  user = await newUser(browser);
  const { page } = user;
  const { groupId } = await createGroup(page, "קבוצת רכבים 2");
  await page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(page, groupId, { ...FAMILY, car: { label: "מאזדה" } });

  await page.goto(`/g/${groupId}/me`);
  await expect(page.getByRole("region", { name: he.cars.summary })).toContainText("מאזדה");
  await page.getByRole("link", { name: he.cars.manage }).click();
  await page.getByRole("button", { name: he.form.removeCar }).click();
  await expect(page.getByText(he.form.carsHint)).toBeVisible();
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.cars.saved)).toBeVisible();

  await page.goto(`/g/${groupId}/me`);
  await expect(page.getByRole("region", { name: he.cars.summary })).toContainText(he.cars.none);
});

test("car photo: crop at upload, cancel keeps the old photo, tap opens it full screen", async ({ browser }) => {
  user = await newUser(browser);
  const { page } = user;
  const { groupId } = await createGroup(page, "קבוצת רכבים 3");
  await page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(page, groupId, { ...FAMILY, car: { label: "מאזדה" } });
  await page.goto(`/g/${groupId}/me/cars`);
  await expect(page.locator("#car-0-label")).toHaveValue("מאזדה");
  const crop = page.getByRole("dialog", { name: he.crop.title });
  const photo = page.locator(".carph-img img");

  // Pick → crop sheet → zoom in → "בחירה": the larger preview shows the 3:2 crop.
  await page.locator("#car-0-photo").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: makePng(120) });
  await expect(crop).toBeVisible();
  await expect(crop.getByRole("img", { name: he.crop.frame })).toBeVisible();
  await crop.getByLabel(he.crop.zoom).fill("2");
  await crop.getByRole("button", { name: he.crop.confirm }).click();
  await expect(crop).toBeHidden();
  await expectImageLoaded(photo);
  expect(await photo.evaluate((el) => [(el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight])).toEqual([60, 40]);
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.cars.saved)).toBeVisible();
  await expect.poll(() => photo.getAttribute("src")).toContain(`/api/g/${groupId}/images/`);
  const savedSrc = await photo.getAttribute("src");

  // Another pick, then "ביטול" (and, again, back): the saved photo stays.
  const blue = { name: "blue.png", mimeType: "image/png", buffer: makePng(80, [40, 80, 220]) };
  await page.locator("#car-0-photo").setInputFiles(blue);
  await expect(crop).toBeVisible();
  await crop.getByRole("button", { name: he.common.cancel }).click();
  await expect(crop).toBeHidden();
  expect(await photo.getAttribute("src")).toBe(savedSrc);
  await page.locator("#car-0-photo").setInputFiles(blue);
  await expect(crop).toBeVisible();
  await page.goBack();
  await expect(crop).toBeHidden();
  expect(await photo.getAttribute("src")).toBe(savedSrc);
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/me/cars$`));

  // Tapping the photo opens it full screen; ×, Escape and back each close it.
  const open = page.getByRole("button", { name: he.photo.open("מאזדה") });
  const viewer = page.getByRole("dialog", { name: "מאזדה" });
  await open.click();
  await expect(viewer).toBeVisible();
  await expectImageLoaded(viewer.getByRole("img", { name: "מאזדה" }));
  await viewer.getByRole("button", { name: he.common.close }).click();
  await expect(viewer).toBeHidden();
  await open.click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await open.click();
  await expect(viewer).toBeVisible();
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/me/cars$`));
});
