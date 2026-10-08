import { expect, test, type Page } from "@playwright/test";
import { createGroup, he, identityOf, newUser, registerFamily, uniqueSlug, type User } from "./helpers.ts";

/**
 * Optional accounts. Google can't be driven in tests, so these use the local-only dev login
 * (`/auth/dev-login`, enabled by playwright.config.ts → vite.config.ts → AUTH_DEV_LOGIN=1).
 */

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };

let users: User[] = [];
test.afterEach(async () => {
  await Promise.all(users.map((u) => u.ctx.close()));
  users = [];
});
const spawn = async (browser: Parameters<typeof newUser>[0]) => {
  const u = await newUser(browser);
  users.push(u);
  return u;
};

const card = (page: Page) => page.getByRole("region", { name: he.account.cardTitle });
const devLogin = (page: Page, sub: string, name: string) =>
  page.goto(`/auth/dev-login?sub=${sub}&name=${encodeURIComponent(name)}&next=/`);
const signedIn = (page: Page, name: string) => page.getByText(`${he.account.signedInAs} ${name}`);

test("groups follow the account to a second phone; sign out keeps the list", async ({ browser }) => {
  const sub = uniqueSlug("user");
  const a = await spawn(browser);

  // Signed out: the home card offers Google sign-in, with the privacy link.
  await a.page.goto("/");
  await expect(card(a.page)).toBeVisible();
  await expect(card(a.page).getByRole("button", { name: he.account.google })).toBeVisible();
  await expect(card(a.page).getByRole("link", { name: he.account.privacyLink })).toHaveAttribute("href", "/privacy");

  // A group joined before signing in is synced at sign-in…
  const nameBefore = `לפני ${Date.now() % 10000}`;
  const before = await createGroup(a.page, nameBefore, uniqueSlug("before"));
  await a.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(a.page, before.groupId, A);
  await devLogin(a.page, sub, "רונית");
  await expect(signedIn(a.page, "רונית")).toBeVisible();
  await expect(card(a.page)).toHaveCount(0);
  await expect(a.page.getByRole("link", { name: new RegExp(nameBefore) })).toBeVisible();

  // …and one joined while signed in is saved as it happens.
  const nameAfter = `אחרי ${Date.now() % 10000}`;
  const after = await createGroup(a.page, nameAfter, uniqueSlug("after"));
  await a.page.getByRole("link", { name: he.newGroup.continue }).click();
  await a.page.locator("#copy-from").selectOption(""); // a blank form, not a copy of the first group
  await registerFamily(a.page, after.groupId, A);

  // A fresh phone signs in as the same person: both groups, same family, no "מי אתם?".
  const b = await spawn(browser);
  await b.page.goto("/");
  await expect(card(b.page)).toBeVisible();
  await expect(b.page.getByRole("link", { name: new RegExp(nameBefore) })).toHaveCount(0);
  await devLogin(b.page, sub, "רונית");
  await expect(b.page.getByRole("link", { name: new RegExp(nameBefore) })).toBeVisible();
  await expect(b.page.getByRole("link", { name: new RegExp(nameAfter) })).toBeVisible();
  expect(await identityOf(b.page, after.groupId)).toBe(await identityOf(a.page, after.groupId));
  await b.page.getByRole("link", { name: new RegExp(nameAfter) }).click();
  await expect(b.page).toHaveURL(new RegExp(`/g/${after.groupId}$`));
  await expect(b.page.getByRole("banner")).toContainText(he.family(A.name));

  // The ☰ menu shows the account too.
  await b.page.getByRole("banner").getByRole("button", { name: he.nav.menu }).click();
  await expect(b.page.getByRole("dialog")).toContainText(`${he.account.signedInAs} רונית`);
  await b.page.keyboard.press("Escape");

  // Sign out: the card is back, the groups stay on this phone.
  await b.page.goto("/");
  await b.page.getByRole("button", { name: he.account.signOut }).click();
  await expect(b.page.getByText(he.account.signedOut)).toBeVisible();
  await expect(card(b.page)).toBeVisible();
  await expect(signedIn(b.page, "רונית")).toHaveCount(0);
  await expect(b.page.getByRole("link", { name: new RegExp(nameAfter) })).toBeVisible();
  const me = await b.page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  expect(me).toEqual({ user: null, groups: [] });
});

test("the Google button signs in (dev login stands in for Google); failures show a toast", async ({ browser }) => {
  const u = await spawn(browser);
  await u.page.goto("/");
  await card(u.page).getByRole("button", { name: he.account.google }).click();
  await expect(u.page).toHaveURL(/\/$/);
  await expect(u.page.getByText(he.account.signedInAs)).toBeVisible();

  await u.page.goto("/?login=failed");
  await expect(u.page.getByText(he.account.failed)).toBeVisible();
  await expect(u.page).toHaveURL(/\/$/);
});

test("accounts off: no sign-in card or menu row; the privacy page", async ({ browser }) => {
  const u = await spawn(browser);
  await u.page.route("**/api/config", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { features: Record<string, boolean> };
    await route.fulfill({ response: res, json: { ...body, features: { ...body.features, accounts: false } } });
  });
  await u.page.goto("/");
  await expect(u.page.getByRole("link", { name: he.home.create })).toBeVisible();
  await expect(card(u.page)).toHaveCount(0);
  await u.page.getByRole("banner").getByRole("button", { name: he.nav.menu }).click();
  await expect(u.page.getByRole("dialog").getByRole("link", { name: he.nav.allGroups })).toBeVisible();
  await expect(u.page.getByRole("dialog").getByText(he.account.google)).toHaveCount(0);

  await u.page.goto("/privacy");
  await expect(u.page.getByRole("heading", { name: he.privacy.title })).toBeVisible();
  await expect(u.page.getByText(he.privacy.paragraphs[1]!)).toBeVisible();
});
