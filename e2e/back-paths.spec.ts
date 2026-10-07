import { expect, test, type Page } from "@playwright/test";
import { he, newUser, registerFamily, soloScene, type User } from "./helpers.ts";

/**
 * Back never lands on "מי אתם?" for a phone that has a family, and the header back arrow follows the
 * hierarchy (invite → event → group → my groups) when there is no in-app history.
 */

const FAMILY = { name: "כהן", parent: "רוני", phone: "050-111-2222", kid: "נועה" };
const backArrow = (page: Page) => page.getByRole("banner").getByRole("button", { name: he.common.back });
const path = (page: Page) => new URL(page.url()).pathname;

/** An in-app link tap (pushes a history entry like a real link would). */
async function tapLink(page: Page, href: string) {
  await page.evaluate((h) => {
    const a = document.createElement("a");
    a.href = h;
    a.textContent = "go";
    document.body.append(a);
    a.click();
    a.remove();
  }, href);
  await expect.poll(() => path(page)).toBe(href);
}

let owner: User | undefined;
let guest: User | undefined;

test.afterEach(async () => {
  await owner?.ctx.close();
  await guest?.ctx.close();
  owner = guest = undefined;
});

test("after registering from an event link, back never returns to who", async ({ browser }) => {
  owner = await newUser(browser);
  const scene = await soloScene(owner.page, FAMILY);
  const invite = `${scene.eventUrl}/invite`;

  guest = await newUser(browser);
  const page = guest.page;
  await page.goto("/");
  await page.goto(scene.eventUrl);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeVisible();
  await registerFamily(page, scene.groupId, { name: "לוי", parent: "דנה", phone: "052-333-4444", kid: "איתי" }, new RegExp(`${scene.eventUrl}$`));

  // event → invite → back → event → back → where we were before the link (not who, not join).
  await tapLink(page, invite);
  await page.goBack();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await page.goBack();
  await expect.poll(() => path(page)).toBe("/");

  // Forward again, then reload on the invite and go back (iOS-like history.back after a full reload).
  await page.goForward();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await tapLink(page, invite);
  await page.reload();
  await expect(backArrow(page)).toBeVisible();
  await page.goBack();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeHidden();

  // Reload on the invite, then the header back arrow.
  await tapLink(page, invite);
  await page.reload();
  await backArrow(page).click();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeHidden();
});

test("a deep link with no history: the back arrow walks up the hierarchy", async ({ browser }) => {
  owner = await newUser(browser);
  const scene = await soloScene(owner.page, FAMILY);
  const page = await owner.ctx.newPage();
  await page.goto(`${scene.eventUrl}/invite`);
  await backArrow(page).click();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await backArrow(page).click();
  await expect.poll(() => path(page)).toBe(`/g/${scene.groupId}`);
  await backArrow(page).click();
  await expect.poll(() => path(page)).toBe("/");
  await expect(page.getByRole("heading", { name: he.who.title })).toBeHidden();
});

test("a fresh phone on a deep link: who is a redirect, the back arrow goes up", async ({ browser }) => {
  owner = await newUser(browser);
  const scene = await soloScene(owner.page, FAMILY);
  guest = await newUser(browser);
  const page = guest.page;
  await page.goto(`${scene.eventUrl}/invite`);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeVisible();
  await registerFamily(page, scene.groupId, { name: "לוי", parent: "דנה", phone: "052-333-4444", kid: "איתי" }, new RegExp(`${scene.eventUrl}/invite$`));
  // Who and the form were replaced: no in-app entry behind, so the arrow walks up.
  await backArrow(page).click();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await expect(page.getByRole("heading", { name: he.who.title })).toBeHidden();
  await backArrow(page).click();
  await expect.poll(() => path(page)).toBe(`/g/${scene.groupId}`);
});

test("switching family from settings returns to settings, without who in history", async ({ browser }) => {
  owner = await newUser(browser);
  const scene = await soloScene(owner.page, FAMILY);
  const page = owner.page;
  const g = `/g/${scene.groupId}`;
  await page.goto(g);
  await tapLink(page, `${g}/settings`);
  await page.getByRole("link", { name: he.settings.switchFamily }).click();
  await expect(page.getByRole("heading", { name: he.who.title })).toBeVisible();
  await page.getByRole("button", { name: he.family(FAMILY.name) }).click();
  await page.getByRole("dialog", { name: he.who.confirmTitle }).getByRole("button", { name: he.who.confirm }).click();
  await expect.poll(() => path(page)).toBe(`${g}/settings`);
  await page.goBack();
  await expect.poll(() => path(page)).toBe(g);
});
