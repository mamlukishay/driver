import { expect, test, type Page } from "@playwright/test";
import { apiGroup, familyIdOf, he, newUser, soloScene, type User } from "./helpers.ts";

/**
 * Opening the feedback sheet (`?sheet=feedback`) must never trigger a route guard or redirect, and
 * must not lose typed form input: the pathname stays, the sheet opens, back closes it.
 */

const FAMILY = { name: "כהן", parent: "רוני", phone: "050-111-2222", kid: "נועה" };
const fab = (page: Page) => page.getByRole("button", { name: he.feedback.buttonLabel });
const dialog = (page: Page) => page.getByRole("dialog", { name: he.feedback.title });

async function openAndCloseFeedback(page: Page) {
  const before = new URL(page.url());
  await fab(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/[?&]sheet=feedback/);
  const during = new URL(page.url());
  expect(during.pathname).toBe(before.pathname);
  // Existing query params (e.g. `new`, `next`) survive.
  for (const [k, v] of before.searchParams) expect(during.searchParams.get(k)).toBe(v);
  await page.goBack();
  await expect(dialog(page)).toBeHidden();
  const after = new URL(page.url());
  expect(after.pathname).toBe(before.pathname);
  expect(after.search).toBe(before.search);
}

let owner: User | undefined;
let guest: User | undefined;

test.afterEach(async () => {
  await owner?.ctx.close();
  await guest?.ctx.close();
  owner = guest = undefined;
});

test("feedback sheet on the who + registration screens keeps the route and the form", async ({ browser }) => {
  owner = await newUser(browser);
  const scene = await soloScene(owner.page, FAMILY);

  guest = await newUser(browser);
  const page = guest.page;
  // An event link on a phone without a family → "מי אתם?".
  await page.goto(scene.eventUrl);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeVisible();
  await openAndCloseFeedback(page);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeVisible();

  await page.getByRole("link", { name: he.who.newFamily }).click();
  await expect(page).toHaveURL(new RegExp(`/join/${scene.groupId}\\?new=1`));
  await page.getByLabel(he.form.familyName, { exact: true }).fill("ישראלי");
  await page.getByLabel(he.form.parentPhone, { exact: true }).fill("054-555-6666");
  // The floating button sits above the sticky primary button, not on it.
  const fabBox = (await fab(page).boundingBox())!;
  const ctaBox = (await page.getByRole("button", { name: he.join.submit }).boundingBox())!;
  expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(ctaBox.y);
  await openAndCloseFeedback(page);
  await expect(page.getByLabel(he.form.familyName, { exact: true })).toHaveValue("ישראלי");
  await expect(page.getByLabel(he.form.parentPhone, { exact: true })).toHaveValue("054-555-6666");

  // Closing with the × button (a replace, not back) keeps the form and the query too.
  const before = page.url();
  await fab(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: he.common.close }).first().click();
  await expect(dialog(page)).toBeHidden();
  expect(page.url()).toBe(before);
  await expect(page.getByLabel(he.form.familyName, { exact: true })).toHaveValue("ישראלי");

  // Registering still returns to the event the link pointed at.
  await page.getByLabel(he.form.parentName, { exact: true }).fill("אבי");
  await page.getByLabel(he.form.kidName, { exact: true }).fill("תמר");
  await page.getByRole("button", { name: he.join.submit }).click();
  await expect(page).toHaveURL(new RegExp(`${scene.eventUrl}$`));
});

test("feedback sheet on /join/:group directly and on every screen type keeps the route", async ({ browser }) => {
  owner = await newUser(browser);
  const page = owner.page;
  const scene = await soloScene(page, FAMILY);
  const g = `/g/${scene.groupId}`;

  guest = await newUser(browser);
  await guest.page.goto(`/join/${scene.groupId}?new=1`);
  await expect(guest.page.getByLabel(he.form.familyName, { exact: true })).toBeVisible();
  await guest.page.getByLabel(he.form.familyName, { exact: true }).fill("ישראלי");
  await openAndCloseFeedback(guest.page);
  await expect(guest.page.getByLabel(he.form.familyName, { exact: true })).toHaveValue("ישראלי");

  const grp = await apiGroup(page, scene.groupId, await familyIdOf(page, scene.groupId));
  const kidId = grp.families[0]!.kids[0]!.id;
  for (const path of [g, `${g}/kid/${kidId}`, `${g}/settings`, `${g}/me`, `${g}/new`, scene.eventUrl, `${scene.eventUrl}/out`, `${scene.eventUrl}/drive/out`]) {
    await page.goto(path);
    await expect(fab(page)).toBeVisible();
    await openAndCloseFeedback(page);
    expect(new URL(page.url()).pathname).toBe(path);
  }
});
