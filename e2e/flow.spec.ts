import { expect, test } from "@playwright/test";
import { formatPhoneLocal } from "../shared/phone.ts";
import type { EventView } from "../shared/types.ts";
import {
  apiEvent,
  apiGroup,
  createEventManually,
  createGroup,
  emptySeat,
  eventIdFromUrl,
  he,
  familyIdOf,
  newUser,
  offerCar,
  registerFamily,
  rsvpBothLegs,
  seatedKid,
  undoButton,
  waitingSection,
  type User,
} from "./helpers.ts";

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };
const B = { name: "לוי", parent: "דוד", phone: "054-222-2222", kid: "דני", car: { label: "מאזדה אדומה", seats: 3 } };
const C = { name: "מזרחי", parent: "יעל", phone: "053-333-3333", kid: "גל" };

test("main flow: two families, live seating, undo, driver phones, shared contacts, kid page", async ({ browser }) => {
  const users: User[] = [];
  const spawn = async () => {
    const u = await newUser(browser);
    users.push(u);
    return u;
  };
  try {
    const a = await spawn();
    const b = await spawn();

    // --- A creates the group and registers (kid, no car) ---
    const { groupId, inviteUrl } = await createGroup(a.page, "כיתה ד׳ 2");
    await a.page.getByRole("link", { name: he.newGroup.continue }).click();
    await registerFamily(a.page, groupId, A);
    await expect(a.page.locator(".who")).toContainText(he.family(A.name));

    // --- B joins from the invite link, registers with a car ---
    await b.page.goto(inviteUrl);
    await expect(b.page.getByRole("heading", { name: he.who.title })).toBeVisible();
    await registerFamily(b.page, groupId, B);
    await expect(b.page.locator(".who")).toContainText(he.family(B.name));

    // --- A creates the event manually and RSVPs the kid for both legs ---
    const eventId = await createEventManually(a.page, groupId, "יום הולדת לתמר");
    const eventUrl = `/g/${groupId}/e/${eventId}`;
    await expect(a.page.getByRole("heading", { name: "יום הולדת לתמר" })).toBeVisible();
    await rsvpBothLegs(a.page);

    // --- B opens the board and offers the car on the outbound leg ---
    await b.page.goto(`${eventUrl}/out`);
    await expect(waitingSection(b.page, "out").getByRole("button", { name: A.kid })).toBeVisible();
    await offerCar(b.page, "out");
    await expect(b.page.getByText(he.toast.offered("out"))).toBeVisible();

    // --- A seats the kid into B's car with two taps (no confirmation); B sees it live (no reload) ---
    await a.page.goto(`${eventUrl}/out`);
    await waitingSection(a.page, "out").getByRole("button", { name: A.kid }).click();
    await emptySeat(a.page, B.name).click();
    await expect(a.page).not.toHaveURL(/sheet=/);
    await expect(a.page.getByText(he.toast.seated(A.kid, he.family(B.name)))).toBeVisible();
    await expect(seatedKid(a.page, A.kid)).toBeVisible();
    await expect(seatedKid(b.page, A.kid)).toBeVisible();
    await expect(waitingSection(b.page, "out")).not.toContainText(A.kid);
    await expect(b.page.getByText(he.gap.ok("out"))).toBeVisible();

    // --- A undoes: the kid is waiting again, on both pages ---
    await undoButton(a.page).click();
    await expect(waitingSection(a.page, "out").getByRole("button", { name: A.kid })).toBeVisible();
    await expect(waitingSection(b.page, "out").getByRole("button", { name: A.kid })).toBeVisible();
    await expect(seatedKid(b.page, A.kid)).toHaveCount(0);

    // The "back" leg was never touched and is still waiting for a car.
    await a.page.getByRole("link", { name: new RegExp(he.legName.back) }).click();
    await expect(a.page).toHaveURL(/\/back$/);
    await expect(waitingSection(a.page, "back").getByRole("button", { name: A.kid })).toBeVisible();
    // Tabs replace the history entry, so switching back is another tab tap (not browser back).
    await a.page.getByRole("link", { name: new RegExp(he.legName.out) }).click();
    await expect(a.page).toHaveURL(/\/out$/);

    // --- A seats again ---
    await waitingSection(a.page, "out").getByRole("button", { name: A.kid }).click();
    await emptySeat(a.page, B.name).click();
    await expect(seatedKid(a.page, A.kid)).toBeVisible();
    await expect(seatedKid(b.page, A.kid)).toBeVisible();

    // --- B (the driver) taps the seated kid: off the car at once, back to waiting; then A seats again ---
    await seatedKid(b.page, A.kid).click();
    await expect(b.page.getByText(he.toast.unseated(A.kid))).toBeVisible();
    await expect(waitingSection(a.page, "out").getByRole("button", { name: A.kid })).toBeVisible();
    await waitingSection(a.page, "out").getByRole("button", { name: A.kid }).click();
    await emptySeat(a.page, B.name).click();
    await expect(seatedKid(a.page, A.kid)).toBeVisible();
    await expect(seatedKid(b.page, A.kid)).toBeVisible();

    // --- B's driver mode: "יצאתי" asks to update A's family; A's phone is in the stop's contact sheet ---
    await b.page.getByRole("link", { name: he.event.driveMode }).click();
    await expect(b.page).toHaveURL(/\/drive\/out$/);
    await expect(b.page.getByRole("heading", { name: he.drive.title("out") })).toBeVisible();
    await b.page.getByRole("button", { name: he.drive.start }).click();
    const depart = b.page.getByRole("dialog", { name: he.drive.departTitle });
    await expect(depart).toContainText(he.family(A.name));
    await depart.getByRole("button", { name: he.drive.skip }).click();
    await expect(b.page.getByText(he.drive.progress(0, 1))).toBeVisible();
    await b.page.getByRole("button", { name: he.drive.contacts(A.kid) }).click();
    const contact = b.page.getByRole("dialog", { name: A.kid });
    const aPhone = formatPhoneLocal(A.phone)!;
    await expect(contact.getByRole("link", { name: aPhone })).toHaveAttribute("href", "tel:+972521111111");
    await contact.getByRole("button", { name: he.common.close }).click();
    await expect(contact).toBeHidden();

    // --- C, an unrelated family in a third context, sees everyone's contacts (trust model) ---
    const c = await spawn();
    await c.page.goto(inviteUrl);
    await registerFamily(c.page, groupId, C);
    await c.page.goto(eventUrl);
    await expect(c.page.locator(".who")).toContainText(he.family(C.name));
    const cId = await familyIdOf(c.page, groupId);
    const cEvent = JSON.stringify(await apiEvent(c.page, groupId, eventId, cId));
    expect(cEvent).toContain("+972521111111");
    expect(cEvent).toContain("+972542222222");
    const cGroup = JSON.stringify(await apiGroup(c.page, groupId, cId));
    expect(cGroup).toContain("+972521111111");
    expect(cGroup).toContain("+972542222222");

    // --- the kid link opens the kid page; "אני מוכן/ה" works ---
    const aGroup = await apiGroup(a.page, groupId, await familyIdOf(a.page, groupId));
    const kidId = aGroup.me!.kids[0]!.id;
    const kid = await spawn();
    // The kid page never asks "מי אתם?".
    await kid.page.goto(`/g/${groupId}/kid/${kidId}`);
    await expect(kid.page.getByRole("heading", { name: he.kid.hi(A.kid) })).toBeVisible();
    await expect(kid.page.getByText(he.kid.driver(B.name, B.parent))).toBeVisible();
    await expect(kid.page.getByRole("link", { name: he.kid.callDriver(B.parent) }).first()).toBeVisible();
    await kid.page.getByRole("button", { name: he.kid.ready }).click();
    await expect(kid.page.getByText(he.kid.readyDone)).toBeVisible();
    // ...and the driver sees it live.
    await expect(b.page.getByText(he.drive.waiting)).toBeVisible();

    const finalEvent: EventView = await apiEvent(b.page, groupId, eventId, await familyIdOf(b.page, groupId));
    expect(finalEvent.offers.out[0]?.kidIds).toHaveLength(1);
    expect(eventIdFromUrl(a.page.url())).toBe(eventId);
  } finally {
    await Promise.all(users.map((u) => u.ctx.close()));
  }
});
