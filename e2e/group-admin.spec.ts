import { expect, test, type Page } from "@playwright/test";
import { createGroup, he, newUser, registerFamily, soloScene, uniqueSlug, type User } from "./helpers.ts";

const FAMILY = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };
const path = (page: Page) => new URL(page.url()).pathname;
const WA1 = "https://chat.whatsapp.com/AbCdEf1234567890";
const WA2 = "https://chat.whatsapp.com/ZyXwVu0987654321";

const users: User[] = [];
test.afterEach(async () => {
  for (const u of users.splice(0)) await u.ctx.close();
});

test("a linked WhatsApp group: set on create, opened from home and settings, edited and cleared", async ({ browser }) => {
  const u = await newUser(browser);
  users.push(u);
  const { page } = u;
  const slug = uniqueSlug("wa");

  await page.goto("/new-group");
  await page.getByLabel(he.newGroup.nameLabel).fill("קבוצת וואטסאפ");
  await page.getByLabel(he.newGroup.slugLabel).fill(slug);
  // Invalid link: a form error, nothing created.
  await page.getByLabel(he.waGroup.label).fill("https://wa.me/123");
  await page.getByRole("button", { name: he.newGroup.submit }).click();
  await expect(page.getByText(he.waGroup.invalid)).toBeVisible();
  // Without https:// is fine (normalized).
  await page.getByLabel(he.waGroup.label).fill(WA1.replace("https://", ""));
  await page.getByRole("button", { name: he.newGroup.submit }).click();
  await expect(page.getByRole("heading", { name: he.newGroup.createdTitle })).toBeVisible();
  // Group shares keep the chooser (pick the group in WhatsApp, text prefilled).
  await expect(page.getByRole("link", { name: he.newGroup.share })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);

  await page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(page, slug, FAMILY);

  // Group home: a small "open the WhatsApp group" link to the normalized URL, in a new tab.
  const homeWa = page.getByRole("link", { name: he.waGroup.open });
  await expect(homeWa).toHaveAttribute("href", WA1);
  await expect(homeWa).toHaveAttribute("target", "_blank");

  // Settings: the button, then edit the link.
  await page.goto(`/g/${slug}/settings`);
  await expect(page.getByRole("link", { name: he.waGroup.open })).toHaveAttribute("href", WA1);
  const field = page.getByLabel(he.settings.waLinkLabel);
  await expect(field).toHaveValue(WA1);
  await field.fill("not a link");
  await page.getByRole("button", { name: he.settings.waSave }).click();
  await expect(page.getByText(he.waGroup.invalid)).toBeVisible();
  await field.fill(`${WA2}?mode=ems_copy_t`);
  await page.getByRole("button", { name: he.settings.waSave }).click();
  await expect(page.getByText(he.settings.waSaved)).toBeVisible();
  await expect(page.getByRole("link", { name: he.waGroup.open })).toHaveAttribute("href", WA2);
  await expect(field).toHaveValue(WA2);

  // Clear it: the button disappears here and on the group home (after a reload, from the server).
  await page.getByRole("button", { name: he.settings.waRemove }).click();
  await expect(page.getByText(he.settings.waRemoved)).toBeVisible();
  await expect(page.getByRole("link", { name: he.waGroup.open })).toHaveCount(0);
  await expect(field).toHaveValue("");
  await page.goto(`/g/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "קבוצת וואטסאפ" })).toBeVisible();
  await expect(page.getByRole("link", { name: he.waGroup.open })).toHaveCount(0);
});

test("deleting a group: yes/no confirmation, live notice for others, slug free again", async ({ browser }) => {
  const owner = await newUser(browser);
  const other = await newUser(browser);
  users.push(owner, other);
  const name = "קבוצה למחיקה";
  const slug = uniqueSlug("del");
  await createGroup(owner.page, name, slug);
  await owner.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(owner.page, slug, FAMILY);

  // A second phone has its own family there and keeps the group home open.
  await other.page.goto(`/join/${slug}`);
  await expect(other.page.getByRole("heading", { name: he.who.title })).toBeVisible();
  await registerFamily(other.page, slug, { name: "לוי", parent: "דנה", phone: "052-333-4444", kid: "איתי" });
  await other.page.goto("/");
  await expect(other.page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await other.page.goto(`/g/${slug}`);
  await expect(other.page.getByRole("heading", { level: 1, name })).toBeVisible();

  // Owner: settings → danger section → confirm sheet (pushed as ?sheet=delete-group).
  const page = owner.page;
  await page.goto(`/g/${slug}/settings`);
  await page.getByRole("button", { name: he.settings.deleteOpen }).click();
  await expect(page).toHaveURL(/\?sheet=delete-group$/);
  const sheet = page.getByRole("dialog", { name: he.settings.deleteTitle });
  await expect(sheet).toContainText(he.settings.deleteBody);
  const yes = sheet.getByRole("button", { name: he.settings.deleteYes, exact: true });
  await expect(sheet.getByRole("button", { name: he.common.cancel })).toBeVisible();
  await yes.click();

  await expect.poll(() => path(page)).toBe("/");
  await expect(page.getByRole("status").filter({ hasText: he.settings.deleted })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  expect(await page.evaluate((g) => JSON.parse(localStorage.getItem("trempush.identities") ?? "{}")[g] ?? null, slug)).toBeNull();
  expect(await page.evaluate((g) => JSON.parse(localStorage.getItem("trempush.lastUsed") ?? "{}")[g] ?? null, slug)).toBeNull();

  // The other phone sees it live and its stored family is dropped.
  await expect(other.page.getByRole("heading", { level: 1, name: he.groupGone.title })).toBeVisible();
  await other.page.getByRole("link", { name: he.groupGone.home }).click();
  await expect.poll(() => path(other.page)).toBe("/");
  await expect(other.page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);

  // The API says not found; the slug can be created again (an empty group).
  const r = await page.request.get(`/api/g/${slug}`);
  expect(r.status()).toBe(404);
  expect(((await r.json()) as { error: string }).error).toBe("not_found");
  await createGroup(page, "קבוצה חדשה", slug);
  const fresh = (await (await page.request.get(`/api/g/${slug}`)).json()) as { group: { name: string }; families: unknown[]; events: unknown[] };
  expect(fresh.group.name).toBe("קבוצה חדשה");
  expect(fresh.families).toHaveLength(0);
  expect(fresh.events).toHaveLength(0);
});

test("a stored group that 404s is dropped from my groups and shows the deleted screen", async ({ browser }) => {
  const owner = await newUser(browser);
  users.push(owner);
  const scene = await soloScene(owner.page, FAMILY, "קבוצה שתיעלם");
  const page = owner.page;
  const familyId = await page.evaluate((g) => JSON.parse(localStorage.getItem("trempush.identities") ?? "{}")[g] as string, scene.groupId);
  // Delete behind this phone's back (no open page to hear the live notice).
  await page.goto("/new-group");
  const del = await page.request.delete(`/api/g/${scene.groupId}`, { headers: { "X-Family-Id": familyId } });
  expect(del.ok()).toBeTruthy();
  await page.goto(`/g/${scene.groupId}`);
  await expect(page.getByRole("heading", { level: 1, name: he.groupGone.title })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /קבוצה שתיעלם/ })).toHaveCount(0);
});

test("header arrow and group-name link walk up from a board to my groups, without browser back", async ({ browser }) => {
  const u = await newUser(browser);
  users.push(u);
  const { page } = u;
  const scene = await soloScene(page, FAMILY, "קבוצת כותרת", "טיול");
  const g = `/g/${scene.groupId}`;

  // Deep link to the board (no in-app history at all).
  await page.goto(`${scene.eventUrl}/out`);
  const banner = page.getByRole("banner");
  await banner.getByRole("button", { name: he.common.back }).click();
  await expect.poll(() => path(page)).toBe(scene.eventUrl);
  await expect(page.getByRole("heading", { level: 1, name: "טיול" })).toBeVisible();

  // The muted group-name line is a link to the group home.
  await banner.getByRole("link", { name: "קבוצת כותרת", exact: true }).click();
  await expect.poll(() => path(page)).toBe(g);

  // The group home links to my groups.
  await banner.getByRole("link", { name: he.home.title, exact: true }).click();
  await expect.poll(() => path(page)).toBe("/");
  await expect(page.getByRole("heading", { name: he.home.title })).toBeVisible();

  // The group-name line is on settings, too; and from the group home the arrow goes to my groups.
  await page.goto(`${g}/settings`);
  await banner.getByRole("link", { name: "קבוצת כותרת", exact: true }).click();
  await expect.poll(() => path(page)).toBe(g);
  await banner.getByRole("button", { name: he.common.back }).click();
  await expect.poll(() => path(page)).toBe("/");
});
