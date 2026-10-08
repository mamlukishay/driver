import { expect, test, type Page } from "@playwright/test";
import { createGroup, he, newUser, pickFamily, registerFamily, soloScene, type User } from "./helpers.ts";

/** The header ☰ menu (`?sheet=nav`): every place two taps away, and it never stays in history. */

const FAMILY = { name: "כהן", parent: "רוני", phone: "050-111-2222", kid: "נועה" };
const path = (page: Page) => new URL(page.url()).pathname;
const menuButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: he.nav.menu });
const menu = (page: Page) => page.getByRole("dialog");

async function openMenu(page: Page) {
  await menuButton(page).click();
  await expect(page).toHaveURL(/[?&]sheet=nav/);
  await expect(menu(page)).toBeVisible();
}

let users: User[] = [];
test.afterEach(async () => {
  await Promise.all(users.map((u) => u.ctx.close()));
  users = [];
});

test("from a board: menu → group settings, back returns to the board (not the menu)", async ({ browser }) => {
  const u = await newUser(browser);
  users.push(u);
  const { page } = u;
  const scene = await soloScene(page, FAMILY, "קבוצת תפריט");
  const g = `/g/${scene.groupId}`;
  const board = `${scene.eventUrl}/out`;

  await page.goto(board);
  await openMenu(page);
  const m = menu(page);
  await expect(m.getByRole("heading", { name: "קבוצת תפריט" })).toBeVisible();
  await expect(m).toContainText(he.family(FAMILY.name));
  await expect(m.getByRole("heading", { name: he.nav.thisGroup })).toBeVisible();
  await expect(m.getByRole("link", { name: he.nav.events })).toHaveAttribute("href", g);
  await expect(m.getByRole("link", { name: he.group.myFamily })).toHaveAttribute("href", `${g}/me`);
  await expect(m.getByRole("link", { name: he.nav.myCars })).toHaveAttribute("href", `${g}/me/cars`);
  await expect(m.getByRole("link", { name: he.nav.allGroups })).toHaveAttribute("href", "/");
  await expect(m.getByRole("link", { name: he.newGroup.title })).toHaveAttribute("href", "/new-group");
  await expect(m.locator('[aria-current="page"]')).toHaveCount(0);

  await m.getByRole("link", { name: he.settings.title }).click();
  await expect.poll(() => path(page)).toBe(`${g}/settings`);
  await expect(page).not.toHaveURL(/sheet=/);
  await expect(menu(page)).toBeHidden();

  // The current page is marked; tapping it just closes the menu.
  await openMenu(page);
  const here = menu(page).getByRole("link", { name: he.settings.title });
  await expect(here).toHaveAttribute("aria-current", "page");
  await here.click();
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => path(page)).toBe(`${g}/settings`);
  await expect(page).not.toHaveURL(/sheet=/);

  // Browser back: the board, without the menu open.
  await page.goBack();
  await expect.poll(() => path(page)).toBe(board);
  await expect(page).not.toHaveURL(/sheet=/);
  await expect(menu(page)).toBeHidden();

  // Back closes an open menu and stays on the screen.
  await openMenu(page);
  await page.goBack();
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => path(page)).toBe(board);
  await expect(page).not.toHaveURL(/sheet=/);
});

test("menu → another group of mine switches groups", async ({ browser }) => {
  const a = await newUser(browser);
  const b = await newUser(browser);
  users.push(a, b);
  const sceneA = await soloScene(a.page, FAMILY, "קבוצה א");
  const B = await createGroup(b.page, "קבוצה ב");
  await b.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(b.page, B.groupId, { name: "לוי", parent: "דנה", phone: "052-333-4444", kid: "איתי" });

  // Phone A picks a family in group B too.
  const page = a.page;
  await page.goto(`/g/${B.groupId}`);
  await pickFamily(page, he.family("לוי"));
  await expect.poll(() => path(page)).toBe(`/g/${B.groupId}`);

  await page.goto(sceneA.eventUrl);
  await openMenu(page);
  const m = menu(page);
  const other = m.getByRole("link", { name: /קבוצה ב/ });
  await expect(other).toHaveAttribute("href", `/g/${B.groupId}`);
  await expect(other).toContainText(he.family("לוי"));
  // The current group is not listed among the other groups.
  await expect(m.getByRole("link", { name: /קבוצה א/ })).toHaveCount(0);
  await other.click();
  await expect.poll(() => path(page)).toBe(`/g/${B.groupId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("קבוצה ב");
  await page.goBack();
  await expect.poll(() => path(page)).toBe(sceneA.eventUrl);
  await expect(page).not.toHaveURL(/sheet=/);
});

test("the menu is on my groups too: all groups (current) and a new group", async ({ browser }) => {
  const u = await newUser(browser);
  users.push(u);
  const { page } = u;
  await page.goto("/");
  await openMenu(page);
  const m = menu(page);
  await expect(m.getByRole("heading", { name: he.appName })).toBeVisible();
  await expect(m.getByRole("heading", { name: he.nav.thisGroup })).toHaveCount(0);
  await expect(m.getByRole("link", { name: he.nav.allGroups })).toHaveAttribute("aria-current", "page");
  await m.getByRole("link", { name: he.newGroup.title }).click();
  await expect.poll(() => path(page)).toBe("/new-group");
  await expect(menuButton(page)).toBeVisible();
  await page.goBack();
  await expect.poll(() => path(page)).toBe("/");
  await expect(menu(page)).toBeHidden();
});
