import { expect, test, type Page } from "@playwright/test";
import { apiEvent, apiGroup, familyIdOf, he, newUser, offerCar, soloScene, type Scene, type User } from "./helpers.ts";

const FAMILY = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה", car: { label: "מאזדה אדומה", seats: 4 } };
const TITLE = "יום הולדת לתמר";

let user: User;
let scene: Scene;

test.beforeEach(async ({ browser }) => {
  user = await newUser(browser);
  scene = await soloScene(user.page, FAMILY, "קבוצת לשוניות", TITLE);
});

test.afterEach(async () => {
  await user.ctx.close();
});

const tabs = (page: Page) => page.getByRole("navigation", { name: he.manage.tabs });
const tab = (page: Page, name: string) => tabs(page).getByRole("link", { name: new RegExp(name) });
const openMenu = async (page: Page) => {
  await page.getByRole("button", { name: he.manage.menu }).click();
  await expect(page).toHaveURL(/\?sheet=menu$/);
  return page.getByRole("dialog", { name: he.manage.menuTitle });
};

/** A synthetic horizontal swipe on the page content (Chromium supports `new Touch`). */
async function swipe(page: Page, fromX: number, toX: number) {
  await page.evaluate(
    ([x0, x1]) => {
      const el = document.querySelector(".evframe")!;
      const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(x0!)], changedTouches: [t(x0!)] }));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t(x1!)] }));
    },
    [fromX, toX],
  );
}

test("tabs are real URLs, switch with replace (and swipe), and show both legs' gap dots", async () => {
  const { page } = user;
  const { groupId, eventUrl } = scene;
  const path = () => new URL(page.url()).pathname;

  await page.goto(`/g/${groupId}`);
  await page.getByRole("link", { name: new RegExp(TITLE) }).click();
  await expect.poll(path).toBe(eventUrl);
  const len = await page.evaluate(() => history.length);

  // RSVP'd for both legs, no cars yet: both dots say "missing", visible from every tab.
  await expect(tabs(page).locator('[data-gap="missing"]')).toHaveCount(2);
  await expect(tab(page, he.manage.details)).toHaveAttribute("aria-current", "page");

  await tab(page, he.legName.out).click();
  await expect.poll(path).toBe(`${eventUrl}/out`);
  await expect(tab(page, he.legName.out)).toHaveAttribute("aria-current", "page");
  await expect(tabs(page).locator('[data-gap="missing"]')).toHaveCount(2);
  await tab(page, he.legName.back).click();
  await expect.poll(path).toBe(`${eventUrl}/back`);
  await tab(page, he.manage.details).click();
  await expect.poll(path).toBe(eventUrl);

  // Swipe (RTL: finger to the right = next tab); a swipe from the screen edge is left to the browser.
  await swipe(page, 120, 300);
  await expect.poll(path).toBe(`${eventUrl}/out`);
  await swipe(page, 300, 120);
  await expect.poll(path).toBe(eventUrl);
  await swipe(page, 10, 250);
  await page.waitForTimeout(200);
  expect(path()).toBe(eventUrl);

  // None of that piled up history: back leaves the event.
  expect(await page.evaluate(() => history.length)).toBe(len);
  await page.goBack();
  await expect.poll(path).toBe(`/g/${groupId}`);
});

test("⋯ → edit: start time changes, toast + banner + car flag, owner confirms", async () => {
  const { page } = user;
  const { eventUrl } = scene;
  await page.goto(`${eventUrl}/out`);
  await offerCar(page, "out");

  // Back closes the edit sheet without saving.
  let menu = await openMenu(page);
  await menu.getByRole("button", { name: he.manage.edit }).click();
  await expect(page).toHaveURL(/\?sheet=edit$/);
  let edit = page.getByRole("dialog", { name: he.manage.editTitle });
  await edit.getByLabel(he.newEvent.fTitle, { exact: true }).fill("שם אחר");
  await page.goBack();
  await expect(edit).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${eventUrl}/out$`));
  await expect(page.getByRole("heading", { level: 1, name: `${TITLE} · ${he.legName.out}` })).toBeVisible();

  // Edit the start time and save.
  menu = await openMenu(page);
  await menu.getByRole("button", { name: he.manage.edit }).click();
  edit = page.getByRole("dialog", { name: he.manage.editTitle });
  await expect(edit.getByLabel(he.newEvent.fTitle, { exact: true })).toHaveValue(TITLE);
  await edit.getByLabel(he.newEvent.fStart, { exact: true }).fill("10:30");
  await edit.getByRole("button", { name: he.common.save }).click();
  await expect(edit).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${eventUrl}/out$`));
  await expect(page.getByRole("status").filter({ hasText: he.manage.toastEdited })).toBeVisible();

  // "עודכן" banner with the WhatsApp update.
  const banner = page.getByRole("status", { name: he.manage.updatedTag });
  await expect(banner).toContainText(he.manage.timeChanged("10:00", "10:30"));
  const wa = banner.getByRole("link", { name: he.manage.shareUpdate });
  const text = new URL((await wa.getAttribute("href"))!).searchParams.get("text")!;
  expect(text).toContain(he.manage.timeChanged("10:00", "10:30"));
  expect(text).toContain(eventUrl);

  // My car on the out leg is flagged; "אישור שעה" clears it.
  const check = page.locator(".car").getByText(he.manage.checkDepart);
  await expect(check).toBeVisible();
  await page.getByRole("button", { name: he.manage.confirmDepart }).click();
  await expect(check).toBeHidden();
  await expect(page.getByText(he.manage.toastConfirmed)).toBeVisible();

  // History on the details tab records old → new; the banner shows there too and can be dismissed per device.
  await tab(page, he.manage.details).click();
  await expect(page.getByRole("region", { name: he.board.history })).toContainText(he.manage.fieldChange(he.manage.field.start!, "10:00", "10:30"));
  await banner.getByRole("button", { name: he.manage.dismiss }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(banner).toBeHidden();
});

test("cancel greys the event and freezes rides; restore brings it back", async () => {
  const { page } = user;
  const { groupId, eventId, eventUrl } = scene;
  const familyId = await familyIdOf(page, groupId);
  await page.goto(`${eventUrl}/out`);
  await offerCar(page, "out");

  const menu = await openMenu(page);
  await expect(menu.getByRole("button")).toHaveCount(3); // edit, cancel, close (share is a link); no delete
  await menu.getByRole("button", { name: he.manage.cancel }).click();
  const confirm = page.getByRole("dialog", { name: he.manage.cancelTitle });
  await confirm.getByRole("button", { name: he.manage.cancelYes }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator(".evframe")).toHaveClass(/is-cancelled/);
  await expect(page.getByText(he.manage.cancelledNote)).toBeVisible();

  // Ride controls are gone, and the server refuses rides too.
  await expect(page.getByRole("button", { name: he.board.take })).toHaveCount(0);
  await expect(page.getByRole("button", { name: he.common.edit })).toHaveCount(0);
  const ev = await apiEvent(page, groupId, eventId, familyId);
  const kidId = Object.keys(ev.kidPlans)[0]!;
  const r = await page.request.post(`/api/g/${groupId}/events/${eventId}/actions`, {
    headers: { "X-Family-Id": familyId },
    data: { type: "seatKid", offerId: ev.offers.out[0]!.id, kidId },
  });
  expect(r.status()).toBe(409);
  expect((await r.json()).error).toBe("event_cancelled");

  // Kid page and group home say so.
  await page.goto(`/g/${groupId}/kid/${kidId}/e/${eventId}`);
  await expect(page.getByText(he.manage.kidCancelled)).toBeVisible();
  await page.goto(`/g/${groupId}`);
  const card = page.getByRole("link", { name: new RegExp(TITLE) });
  await expect(card).toHaveClass(/is-cancelled/);
  await expect(card).toContainText(he.manage.cancelledTag);

  // Restore.
  await card.click();
  const menu2 = await openMenu(page);
  await menu2.getByRole("button", { name: he.manage.restore }).click();
  await expect(page.getByText(he.manage.cancelledNote)).toBeHidden();
  await expect(page.locator(".evframe")).not.toHaveClass(/is-cancelled/);
  expect((await apiEvent(page, groupId, eventId, familyId)).cancelled).toBeUndefined();
});

test("group home: my kids' chip, cancelled tag, past events collapsed and hidden after 30 days", async () => {
  const { page } = user;
  const { groupId, eventUrl } = scene;
  const familyId = await familyIdOf(page, groupId);
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const create = async (title: string, date: string) => {
    const r = await page.request.post(`/api/g/${groupId}/events`, {
      headers: { "X-Family-Id": familyId },
      data: { title, date, start: "10:00", returnTime: "12:00", place: "גן", address: "" },
    });
    expect(r.ok()).toBeTruthy();
    return ((await r.json()) as { eventId: string }).eventId;
  };
  await create("טיול שעבר", day(-10));
  const oldId = await create("טיול עתיק", day(-40));

  // RSVP'd both legs, no cars: both "?".
  await page.goto(`/g/${groupId}`);
  const card = page.getByRole("link", { name: new RegExp(TITLE) });
  await expect(card).toContainText(he.manage.myKid(FAMILY.kid, "?", "?"));

  // Take the kid on the out leg → "✓".
  await page.goto(`${eventUrl}/out`);
  await offerCar(page, "out");
  await page.getByRole("button", { name: he.board.take }).click();
  await expect(page.getByText(he.toast.took(FAMILY.kid))).toBeVisible();
  await page.goto(`/g/${groupId}`);
  await expect(card).toContainText(he.manage.myKid(FAMILY.kid, "✓", "?"));

  // Past within 30 days: under a collapsed "אירועים שעברו". Older ones are not listed at all.
  const past = page.locator("details.past");
  await expect(past).not.toHaveAttribute("open", "");
  await expect(page.getByRole("link", { name: /טיול שעבר/ })).toBeHidden();
  await past.locator("summary").click();
  await expect(page.getByRole("link", { name: /טיול שעבר/ })).toBeVisible();
  await expect(page.getByText("טיול עתיק")).toHaveCount(0);
  const group = await apiGroup(page, groupId, familyId);
  expect(group.events.map((e) => e.title)).not.toContain("טיול עתיק");

  // ...but its direct link still works.
  await page.goto(`/g/${groupId}/e/${oldId}`);
  await expect(page.getByRole("heading", { level: 1, name: "טיול עתיק" })).toBeVisible();
});

test("a kid without a phone: no send button, '+ הוספת טלפון' focuses the field", async () => {
  const { page } = user;
  const { eventUrl, groupId } = scene;
  await page.goto(eventUrl);
  await expect(page.getByRole("link", { name: he.event.sendToKidLabel(FAMILY.kid) })).toHaveCount(0);
  await page.getByRole("link", { name: he.manage.noPhone(FAMILY.kid) }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/me\\?focus=kid-[a-z0-9]+-phone$`));
  await expect(page.getByLabel(he.form.kidPhone)).toBeFocused();
});
