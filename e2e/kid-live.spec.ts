import { expect, test, type Page } from "@playwright/test";
import {
  apiEvent,
  apiGroup,
  createGroup,
  emptySeat,
  eventIdFromUrl,
  familyIdOf,
  he,
  newUser,
  offerCar,
  registerFamily,
  rsvpBothLegs,
  seatedKid,
  waitingSection,
  type User,
} from "./helpers.ts";

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה", kidPhone: "053-111-1111" };
const B = { name: "לוי", parent: "דוד", phone: "054-222-2222", kid: "דני", car: { label: "מאזדה אדומה", seats: 3 } };

/** Tomorrow in the group's zone, so the legs are never "over" whatever time the suite runs. */
const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

async function createEventTomorrow(page: Page, groupId: string, title: string): Promise<string> {
  await page.getByRole("link", { name: he.group.newEvent }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/new$`));
  await page.getByLabel(he.newEvent.fTitle, { exact: true }).fill(title);
  await page.getByLabel(he.newEvent.fDate, { exact: true }).fill(tomorrow());
  await page.getByLabel(he.newEvent.fPlace, { exact: true }).fill("פארק הירקון");
  await page.getByRole("button", { name: he.newEvent.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/e/[a-z0-9-]+$`));
  return eventIdFromUrl(page.url());
}

test("per-event kid link: shared by the parent, live ride status as the driver goes", async ({ browser }) => {
  const users: User[] = [];
  const spawn = async () => {
    const u = await newUser(browser);
    users.push(u);
    return u;
  };
  try {
    const a = await spawn();
    const b = await spawn();

    // --- A (kid, no car) creates the group; B (driver) joins ---
    const { groupId, inviteUrl } = await createGroup(a.page, "כיתה ה׳ 1");
    await a.page.getByRole("link", { name: he.newGroup.continue }).click();
    await registerFamily(a.page, groupId, A);
    await b.page.goto(inviteUrl);
    await registerFamily(b.page, groupId, B);

    // --- A creates tomorrow's event and RSVPs; B offers the outbound car; A seats the kid ---
    const title = "מסיבת סוף שנה";
    const eventId = await createEventTomorrow(a.page, groupId, title);
    const eventUrl = `/g/${groupId}/e/${eventId}`;
    await rsvpBothLegs(a.page);
    await b.page.goto(`${eventUrl}/out`);
    await offerCar(b.page, "out");
    await a.page.goto(`${eventUrl}/out`);
    await waitingSection(a.page, "out").getByRole("button", { name: A.kid }).click();
    await emptySeat(a.page, B.name).click();
    await expect(seatedKid(a.page, A.kid)).toBeVisible();

    // --- The kid has no phone: no sending, only a shortcut to add one (KISS). Add it. ---
    await a.page.goto(eventUrl);
    await expect(a.page.getByRole("link", { name: he.event.sendToKidLabel(A.kid) })).toHaveCount(0);
    await a.page.getByRole("link", { name: he.manage.noPhone(A.kid) }).click();
    await expect(a.page).toHaveURL(/\/me\?focus=kid-[a-z0-9]+-phone$/);
    await expect(a.page.getByLabel(he.form.kidPhone)).toBeFocused();
    await a.page.getByLabel(he.form.kidPhone).fill(A.kidPhone);
    await a.page.getByRole("button", { name: he.common.save }).click();
    await expect(a.page.getByText(he.profile.saved)).toBeVisible();

    // --- A shares the per-event link from the event page ("my kids") ---
    await a.page.goto(eventUrl);
    const send = a.page.getByRole("link", { name: he.event.sendToKidLabel(A.kid) });
    await expect(send).toBeVisible();
    await expect(send).toContainText(he.event.sendToKid(A.kid));
    const href = (await send.getAttribute("href"))!;
    // Straight to the kid's phone.
    expect(href.startsWith("https://wa.me/972531111111?text=")).toBe(true);
    const text = new URL(href).searchParams.get("text")!;
    expect(text).toContain(title);
    expect(text).toContain(he.legName.out);
    expect(text).toContain(he.family(B.name));
    expect(text).toContain(he.wa.legLine("back", null));
    const aGroup = await apiGroup(a.page, groupId, await familyIdOf(a.page, groupId));
    const kidId = aGroup.me!.kids[0]!.id;
    const link = /https?:\/\/\S+/.exec(text)?.[0];
    expect(link).toBeTruthy();
    expect(new URL(link!).pathname).toBe(`/g/${groupId}/kid/${kidId}/e/${eventId}`);

    // --- The kid opens it: one event, "assigned" on the way there, still waiting on the way back ---
    const kid = await spawn();
    await kid.page.goto(link!);
    await expect(kid.page.getByRole("heading", { name: he.kid.hi(A.kid) })).toBeVisible();
    const outStatus = kid.page.getByRole("status", { name: he.kid.statusLabel("out") });
    const backStatus = kid.page.getByRole("status", { name: he.kid.statusLabel("back") });
    await expect(outStatus).toHaveAttribute("data-status", "assigned");
    await expect(outStatus).toContainText(he.kid.driver(B.name));
    await expect(backStatus).toHaveAttribute("data-status", "waiting");
    await expect(backStatus).toContainText(he.kid.status.waiting);
    await expect(kid.page.getByRole("button", { name: he.kid.ready })).toBeVisible();

    // --- Driver mode, "יצאתי": the kid page updates live (no reload). ---
    await b.page.goto(`${eventUrl}/drive/out`);
    await b.page.getByRole("button", { name: he.drive.start }).click();
    // The departure sheet: one message for A's family, to the kid's own phone, with the per-event kid link.
    const depart = b.page.getByRole("dialog", { name: he.drive.departTitle });
    const shareLink = depart.getByRole("link", { name: he.drive.sendLabel(A.kid) });
    await expect(shareLink).toHaveAttribute("href", /^https:\/\/wa\.me\/972531111111\?text=/);
    const shareText = new URL((await shareLink.getAttribute("href"))!).searchParams.get("text")!;
    expect(shareText).toContain(`/g/${groupId}/kid/${kidId}/e/${eventId}`);
    await depart.getByRole("button", { name: he.drive.skip }).click();
    await expect(b.page.getByText(he.drive.progress(0, 1))).toBeVisible();
    await expect(outStatus).toHaveAttribute("data-status", "onTheWay");
    await expect(outStatus).toContainText(he.kid.status.onTheWay(B.parent));

    // --- The driver sends an ETA ("בעוד 10 דק׳"): the kid sees a clock time and when it was set ---
    const bFamily = await familyIdOf(b.page, groupId);
    const act = async (action: object) => {
      const r = await b.page.request.post(`/api/g/${groupId}/events/${eventId}/actions`, { data: action, headers: { "X-Family-Id": bFamily } });
      expect(r.ok()).toBeTruthy();
    };
    const offerId = (await apiEvent(b.page, groupId, eventId, bFamily)).offers.out[0]!.id;
    await act({ type: "setEta", offerId, kidIds: [kidId], minutes: 10 });
    await expect(outStatus).toHaveAttribute("data-status", "onTheWay");
    await expect(outStatus).toContainText(/הגעה בערך ב-\d{2}:\d{2}/);
    await expect(outStatus).toContainText(/עודכן ב-\d{2}:\d{2}/);

    // --- "הגעתי" at the kid's stop → "דוד למטה!" ---
    await b.page.getByRole("button", { name: he.drive.arriveLabel(A.kid) }).click();
    await expect(b.page.getByRole("button", { name: he.drive.pickLabel(A.kid) })).toBeVisible();
    await expect(outStatus).toHaveAttribute("data-status", "arrived");
    await expect(outStatus).toContainText(he.kid.status.arrived(B.parent));

    // --- Picked up → "עלית לרכב ✓" ---
    await b.page.getByRole("button", { name: he.drive.pickLabel(A.kid) }).click();
    await expect(b.page.getByText(he.drive.allIn)).toBeVisible();
    await expect(outStatus).toHaveAttribute("data-status", "picked");
    await expect(outStatus).toContainText(he.kid.status.picked);
    await expect(backStatus).toHaveAttribute("data-status", "waiting");

    // --- "הגענו" ends the run → "הגעתם" ---
    await act({ type: "endRun", offerId, ended: true });
    await expect(outStatus).toHaveAttribute("data-status", "done");
    await expect(outStatus).toContainText(he.kid.status.endedOut);
  } finally {
    for (const u of users) await u.ctx.close();
  }
});
