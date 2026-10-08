import { expect, test } from "@playwright/test";
import { apiGroup, createEventManually, createGroup, familyIdOf, he, newUser, registerFamily, rsvpBothLegs, type User } from "./helpers.ts";

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
  await page.getByLabel(he.form.address).fill("הנשיא 5, חיפה");
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.profile.saved)).toBeVisible();
  const g = await apiGroup(page, groupId, await familyIdOf(page, groupId));
  expect(g.me?.address).toBe("הנשיא 5, חיפה");
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
