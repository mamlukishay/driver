import { expect, test } from "@playwright/test";
import { apiEvent, apiGroup, familyIdOf, he, newUser, soloScene, type User } from "./helpers.ts";

const FAMILY = { name: "כץ", parent: "דנה", phone: "052-111-1111", kid: "גיל", car: { label: "מאזדה" } };
const DAD = { name: "אבי", phone: "054-222-2222" };

let user: User | undefined;
test.afterEach(async () => {
  await user?.ctx.close();
  user = undefined;
});

test("two drivers, two cars, one leg: the kid page names the chosen driver", async ({ browser }) => {
  user = await newUser(browser);
  const page = user.page;
  const scene = await soloScene(page, FAMILY);
  const famId = await familyIdOf(page, scene.groupId);

  // --- The family page: "הורים ונהגים" gets a second person (the first keeps their id) ---
  const before = await apiGroup(page, scene.groupId, famId);
  const momId = before.me!.parents[0]!.id;
  await page.goto(`/g/${scene.groupId}/me`);
  await expect(page.getByRole("heading", { name: he.form.parents })).toBeVisible();
  await page.getByRole("button", { name: he.form.addParent }).click();
  await page.locator("#parent-1-name").fill(DAD.name);
  await page.locator("#parent-1-phone").fill(DAD.phone);
  await page.getByRole("button", { name: he.common.save }).click();
  await expect(page.getByText(he.profile.saved)).toBeVisible();
  const me = (await apiGroup(page, scene.groupId, famId)).me!;
  expect(me.parents.map((p) => p.name)).toEqual([FAMILY.parent, DAD.name]);
  expect(me.parents[0]!.id).toBe(momId);
  const dadId = me.parents[1]!.id;

  // A second car (cars have their own page; the API keeps this short).
  const put = await page.request.put(`/api/g/${scene.groupId}/families/me`, {
    headers: { "X-Family-Id": famId },
    data: { name: me.name, address: me.address, parents: me.parents, kids: me.kids, cars: [...me.cars, { label: "קיה", seats: 3 }] },
  });
  expect(put.ok()).toBeTruthy();

  // --- Board, out: Dad drives the Mazda and takes the kid ---
  await page.goto(`${scene.eventUrl}/out`);
  await page.getByRole("button", { name: he.board.offer("out") }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("group", { name: he.carSheet.driver })).toBeVisible();
  await expect(sheet.getByRole("button", { name: FAMILY.parent })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: DAD.name }).click();
  await expect(sheet.getByRole("button", { name: DAD.name })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: FAMILY.car.label }).click();
  await sheet.getByRole("button", { name: he.carSheet.submit }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("article.car").first()).toContainText(`${DAD.name} · ${he.family(FAMILY.name)}`);
  await page.getByRole("button", { name: he.board.take }).click();
  await expect(page.getByRole("button", { name: he.board.seatedKid(FAMILY.kid) })).toBeVisible();

  // --- A second car on the same leg: Dad is taken, so Mom; the Mazda is taken, so the Kia ---
  await page.getByRole("button", { name: he.board.offerAnother("out") }).click();
  await expect(sheet.getByRole("button", { name: DAD.name })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: FAMILY.parent })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet).toContainText("קיה");
  await sheet.getByRole("button", { name: he.carSheet.submit }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("article.car")).toHaveCount(2);
  await expect(page.locator("article.car").nth(1)).toContainText(`${FAMILY.parent} · ${he.family(FAMILY.name)}`);
  const ev = await apiEvent(page, scene.groupId, scene.eventId, famId);
  expect(ev.offers.out.map((o) => o.driverId)).toEqual([dadId, momId]);
  // Every car and person is used on this leg: no third offer.
  await expect(page.getByRole("button", { name: he.board.offerAnother("out") })).toHaveCount(0);

  // --- The kid page names Dad and calls Dad ---
  const kidId = me.kids[0]!.id;
  await page.goto(`/g/${scene.groupId}/kid/${kidId}`);
  const out = page.getByRole("status", { name: he.kid.statusLabel("out") });
  await expect(out).toContainText(he.kid.driver(FAMILY.name, DAD.name));
  await expect(page.getByRole("link", { name: he.kid.callDriver(DAD.name) })).toHaveAttribute("href", "tel:+972542222222");
});
