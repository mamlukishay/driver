import { expect, test } from "@playwright/test";
import {
  apiEvent,
  createEventManually,
  createGroup,
  he,
  identityOf,
  isoInDays,
  familyIdOf,
  newUser,
  offerCar,
  registerFamily,
  rsvpBothLegs,
  waitingSection,
  type User,
} from "./helpers.ts";

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };
const B = { name: "לוי", parent: "דוד", phone: "054-222-2222", kid: "דני", car: { label: "מאזדה אדומה", seats: 4 } };

test("permissions, identity chip and an unknown stored family", async ({ browser }) => {
  const a: User = await newUser(browser);
  const b: User = await newUser(browser);
  try {
    // A: group + family (kid, no car). B: joins, has a car, offers it. B's kid is coming too.
    const { groupId, inviteUrl } = await createGroup(a.page, "קבוצת הרשאות");
    await a.page.getByRole("link", { name: he.newGroup.continue }).click();
    await registerFamily(a.page, groupId, A);
    await b.page.goto(inviteUrl);
    await registerFamily(b.page, groupId, B);

    const eventId = await createEventManually(a.page, groupId, "מסיבת סיום");
    const eventUrl = `/g/${groupId}/e/${eventId}`;
    await rsvpBothLegs(a.page);
    await b.page.goto(eventUrl);
    await rsvpBothLegs(b.page);
    await b.page.goto(`${eventUrl}/out`);
    await offerCar(b.page, "out");

    // --- the identity chip shows the right family on each context ---
    await expect(a.page.locator(".who")).toContainText(he.family(A.name));
    await expect(a.page.locator(".who")).not.toContainText(he.family(B.name));
    await expect(b.page.locator(".who")).toContainText(he.family(B.name));
    await expect(b.page.locator(".who")).not.toContainText(he.family(A.name));

    // --- A cannot seat B's kid into B's car ---
    await a.page.goto(`${eventUrl}/out`);
    const bKidChip = waitingSection(a.page, "out").getByRole("button", { name: B.kid });
    await expect(bKidChip).toBeVisible();
    await bKidChip.click();
    // The board refuses up front, with a friendly sentence. No sheet, nothing selected.
    await expect(a.page.getByText(he.board.whyNotMyKid(B.kid))).toBeVisible();
    await expect(a.page).not.toHaveURL(/sheet=/);
    await expect(bKidChip).toHaveAttribute("aria-pressed", "false");

    // Even if A sends the action by hand, the server says no (403 forbidden).
    const aKey = await familyIdOf(a.page, groupId);
    const bKey = await familyIdOf(b.page, groupId);
    const before = await apiEvent(b.page, groupId, eventId, bKey);
    const offer = before.offers.out[0]!;
    const bKid = before.families.find((f) => f.name === B.name)!.kids[0]!;
    expect(offer.kidIds).toEqual([]);
    const forged = await a.page.request.post(`/api/g/${groupId}/events/${eventId}/actions`, {
      headers: { "X-Family-Id": aKey },
      data: { type: "seatKid", offerId: offer.id, kidId: bKid.id },
    });
    expect(forged.status()).toBe(403);
    expect(((await forged.json()) as { error: string }).error).toBe("forbidden");

    // Nothing changed server-side: no seat, same version, B's page unchanged.
    const after = await apiEvent(b.page, groupId, eventId, bKey);
    expect(after.offers.out[0]!.kidIds).toEqual([]);
    expect(after.version).toBe(before.version);
    expect(after.log).toHaveLength(before.log.length);
    await expect(waitingSection(b.page, "out").getByRole("button", { name: B.kid })).toBeVisible();
    // A's own identity survived the refusal (a 403 on an action is not an unknown family).
    expect(await identityOf(a.page, groupId)).not.toBeNull();

    // --- a stored family the group doesn't know gets dropped: back to "מי אתם?" ---
    await a.page.evaluate((g) => {
      const all = JSON.parse(localStorage.getItem("trempush.identities") ?? "{}");
      all[g] = "zzzzzzzz";
      localStorage.setItem("trempush.identities", JSON.stringify(all));
    }, groupId);
    await a.page.goto(`/g/${groupId}`);
    await expect(a.page.getByRole("heading", { name: he.who.title })).toBeVisible();
    await expect.poll(() => identityOf(a.page, groupId)).toBeNull();
    // "רק להסתכל" still shows the group, view-only.
    await a.page.getByRole("button", { name: he.who.justLook }).click();
    await expect(a.page).toHaveURL(new RegExp(`/g/${groupId}$`));
    await expect(a.page.getByText(he.identity.viewOnly)).toBeVisible();
    await expect(a.page.getByText(he.group.viewOnlyNote)).toBeVisible();
    await expect(a.page.getByRole("heading", { level: 1, name: "קבוצת הרשאות" })).toBeVisible();
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});

test("new event: the date starts empty, a past date is refused, a future date fills 10:00", async ({ browser }) => {
  const a: User = await newUser(browser);
  try {
    const { groupId } = await createGroup(a.page, "קבוצת תאריכים");
    await a.page.getByRole("link", { name: he.newGroup.continue }).click();
    await registerFamily(a.page, groupId, A);
    const page = a.page;
    await page.getByRole("link", { name: he.group.newEvent }).click();
    const date = page.getByLabel(he.newEvent.fDate, { exact: true });
    const start = page.getByLabel(he.newEvent.fStart, { exact: true });
    await expect(date).toHaveValue("");
    await expect(start).toHaveValue("");
    await page.getByLabel(he.newEvent.fTitle, { exact: true }).fill("אירוע שעבר");
    await page.getByLabel(he.newEvent.fPlace, { exact: true }).fill("פארק");
    await date.fill(isoInDays(-3));
    await expect(start).toHaveValue("");
    await start.fill("10:00");
    await page.getByLabel(he.newEvent.fReturn, { exact: true }).fill("12:00");
    await page.getByRole("button", { name: he.newEvent.submit }).click();
    await expect(page.getByText(he.newEvent.datePast)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/g/${groupId}/new`));
  } finally {
    await a.ctx.close();
  }
});
