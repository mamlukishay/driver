import { expect, test } from "@playwright/test";
import {
  createEventManually,
  isoInDays,
  createGroup,
  he,
  identityOf,
  newUser,
  offerCar,
  pickFamily,
  registerFamily,
  rsvpBothLegs,
  uniqueSlug,
  type User,
} from "./helpers.ts";

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה", car: { label: "מאזדה", seats: 3 } };
const B = { name: "לוי", parent: "דוד", phone: "054-222-2222", kid: "דני" };

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

test("fresh phone: a group link asks 'מי אתם?', returns to the link; settings switches family", async ({ browser }) => {
  const a = await spawn(browser);
  const b = await spawn(browser);
  const slug = uniqueSlug("class");
  const { groupId, inviteUrl } = await createGroup(a.page, "כיתה ד׳ 1", slug);
  expect(groupId).toBe(slug);
  await a.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(a.page, groupId, A);
  await b.page.goto(inviteUrl);
  await registerFamily(b.page, groupId, B);

  // Event with an English word: its URL is /e/<mon>-<day>-birthday.
  await a.page.goto(`/g/${groupId}`);
  await a.page.getByRole("link", { name: he.group.newEvent }).click();
  await a.page.getByLabel(he.newEvent.fTitle, { exact: true }).fill("יום הולדת");
  await a.page.getByLabel(he.newEvent.fPlace, { exact: true }).fill("פארק");
  // The date starts empty (no default that may already be in the past) and must not be in the past.
  await expect(a.page.getByLabel(he.newEvent.fDate, { exact: true })).toHaveValue("");
  await expect(a.page.getByLabel(he.newEvent.fStart, { exact: true })).toHaveValue("");
  await a.page.getByLabel(he.newEvent.fDate, { exact: true }).fill(isoInDays(-1));
  await expect(a.page.getByLabel(he.newEvent.fStart, { exact: true })).toHaveValue("");
  await a.page.getByLabel(he.newEvent.fStart, { exact: true }).fill("09:00");
  await a.page.getByLabel(he.newEvent.fReturn, { exact: true }).fill("11:00");
  await a.page.getByRole("button", { name: he.newEvent.submit }).click();
  await expect(a.page.getByText(he.newEvent.datePast)).toBeVisible();
  await a.page.getByLabel(he.newEvent.fDate, { exact: true }).fill("2027-10-16");
  await a.page.getByLabel(he.newEvent.fSlugWord).fill("birthday");
  await expect(a.page.getByText(he.newEvent.fSlugWordHint("oct-16-birthday"))).toBeVisible();
  await a.page.getByRole("button", { name: he.newEvent.submit }).click();
  await expect(a.page).toHaveURL(new RegExp(`/g/${groupId}/e/oct-16-birthday$`));
  const boardUrl = `/g/${groupId}/e/oct-16-birthday/out`;

  // A fresh phone opens a deep link to the board.
  const c = await spawn(browser);
  await c.page.goto(boardUrl);
  await expect(c.page).toHaveURL(new RegExp(`/g/${groupId}/who\\?next=`));
  await expect(c.page.getByRole("heading", { name: he.who.title })).toBeVisible();
  // Both families are offered, with their kids' names.
  await expect(c.page.getByRole("button", { name: `${he.family(A.name)} ${A.kid}` })).toBeVisible();
  await expect(c.page.getByRole("button", { name: `${he.family(B.name)} ${B.kid}` })).toBeVisible();
  await pickFamily(c.page, he.family(A.name));
  await expect(c.page).toHaveURL(new RegExp(`${boardUrl}$`));
  await expect(c.page.locator(".who")).toContainText(he.family(A.name));
  expect(await identityOf(c.page, groupId)).toBe(await identityOf(a.page, groupId));
  // Only the family id is stored.
  const stored = await c.page.evaluate(() => JSON.parse(localStorage.getItem("trempush.identities") ?? "{}"));
  expect(Object.keys(stored)).toEqual([groupId]);
  expect(typeof stored[groupId]).toBe("string");

  // Settings (gear) → "החלפת משפחה" → pick B → the chip updates.
  await c.page.getByRole("link", { name: he.identity.settings }).click();
  await expect(c.page).toHaveURL(new RegExp(`/g/${groupId}/settings$`));
  await expect(c.page.getByText(he.settings.actingAs(he.family(A.name)))).toBeVisible();
  await expect(c.page.getByLabel(he.settings.linkLabel)).toHaveValue(new RegExp(`/join/${groupId}$`));
  await c.page.getByRole("link", { name: he.settings.switchFamily }).click();
  await pickFamily(c.page, he.family(B.name));
  await expect(c.page).toHaveURL(new RegExp(`/g/${groupId}/settings$`));
  await expect(c.page.locator(".who")).toContainText(he.family(B.name));
  await expect(c.page.getByText(he.settings.actingAs(he.family(B.name)))).toBeVisible();
  expect(await identityOf(c.page, groupId)).toBe(await identityOf(b.page, groupId));

  // The chip leads to settings too; logging out sends the phone back to "מי אתם?".
  await c.page.goto(`/g/${groupId}`);
  await c.page.locator(".who").click();
  await expect(c.page).toHaveURL(new RegExp(`/g/${groupId}/settings$`));
  await c.page.getByRole("button", { name: he.settings.logout }).click();
  await expect(c.page.getByRole("heading", { name: he.who.title })).toBeVisible();
  expect(await identityOf(c.page, groupId)).toBeNull();
});

test("custom group slug; a duplicate shows the Hebrew error and a suggestion", async ({ browser }) => {
  const a = await spawn(browser);
  const slug = uniqueSlug("dup");
  await createGroup(a.page, "קבוצה ראשונה", slug);

  await a.page.goto("/new-group");
  await a.page.getByLabel(he.newGroup.nameLabel).fill("קבוצה שנייה");
  // The URL name is prefilled with a valid suggestion.
  await expect(a.page.getByLabel(he.newGroup.slugLabel)).toHaveValue(/^group-[a-z0-9]{4}$/);
  // Live validation.
  await a.page.getByLabel(he.newGroup.slugLabel).fill("-ab");
  await expect(a.page.getByText(he.newGroup.slugInvalid)).toBeVisible();
  await a.page.getByLabel(he.newGroup.slugLabel).fill(slug);
  await expect(a.page.getByText(he.newGroup.slugInvalid)).toHaveCount(0);
  await a.page.getByRole("button", { name: he.newGroup.submit }).click();
  await expect(a.page.getByText(he.newGroup.slugTaken(`${slug}-2`))).toBeVisible();
  await a.page.getByRole("button", { name: he.newGroup.useSuggestion(`${slug}-2`) }).click();
  await expect(a.page.getByLabel(he.newGroup.slugLabel)).toHaveValue(`${slug}-2`);
  await a.page.getByRole("button", { name: he.newGroup.submit }).click();
  await expect(a.page.getByLabel(he.newGroup.linkLabel)).toHaveValue(new RegExp(`/join/${slug}-2$`));
});

test("same-named families are told apart; registering the same name offers the existing family", async ({ browser }) => {
  const COHEN1 = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה", car: { label: "מאזדה", seats: 3 } };
  const COHEN2 = { name: "כהן", parent: "דוד", phone: "054-222-2222", kid: "דני", car: { label: "קיה", seats: 3 } };
  const label1 = he.familyLabel({ name: "כהן", extra: [COHEN1.kid] });
  const label2 = he.familyLabel({ name: "כהן", extra: [COHEN2.kid] });
  const a = await spawn(browser);
  const b = await spawn(browser);
  const { groupId, inviteUrl } = await createGroup(a.page, "קבוצת כהנים");
  await a.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(a.page, groupId, COHEN1);

  // The second כהן is asked first, says "another family", and registers.
  await b.page.goto(inviteUrl);
  await registerFamily(b.page, groupId, COHEN2, null);
  const sheet = b.page.getByRole("dialog", { name: he.join.dupTitle });
  await expect(sheet).toContainText(he.join.dupText(he.family("כהן"), [COHEN1.kid]));
  await sheet.getByRole("button", { name: he.join.dupNo }).click();
  await expect(b.page).toHaveURL(new RegExp(`/g/${groupId}$`));

  // Chips are disambiguated by kid names.
  await expect(b.page.locator(".who")).toContainText(label2);
  await a.page.reload();
  await expect(a.page.locator(".who")).toContainText(label1);

  // On the board, both car cards carry the disambiguated label.
  const eventId = await createEventManually(a.page, groupId, "מסיבה");
  await rsvpBothLegs(a.page);
  await a.page.goto(`/g/${groupId}/e/${eventId}/out`);
  await offerCar(a.page, "out");
  await b.page.goto(`/g/${groupId}/e/${eventId}/out`);
  await offerCar(b.page, "out");
  await expect(b.page.locator("article.car").filter({ hasText: label1 }).first()).toBeVisible();
  await expect(b.page.getByRole("button", { name: he.board.emptySeat(label1) }).first()).toBeVisible();
  await expect(b.page.getByRole("button", { name: he.board.emptySeat(label2) }).first()).toBeVisible();

  // A third phone registering "כהן" is offered both existing families and picks the first.
  const c = await spawn(browser);
  await c.page.goto(inviteUrl);
  await registerFamily(c.page, groupId, { name: " כהן ", parent: "רונית", phone: "052-111-1111", kid: "נועה" }, null);
  const sheet3 = c.page.getByRole("dialog", { name: he.join.dupTitle });
  await expect(sheet3).toBeVisible();
  await sheet3.getByRole("button", { name: he.join.dupYesOf(label1) }).click();
  await expect(c.page).toHaveURL(new RegExp(`/g/${groupId}$`));
  await expect(c.page.locator(".who")).toContainText(label1);
  expect(await identityOf(c.page, groupId)).toBe(await identityOf(a.page, groupId));
});
