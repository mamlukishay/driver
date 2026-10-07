import { expect, test, type Page } from "@playwright/test";
import {
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

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };
const B = { name: "לוי", parent: "דוד", phone: "054-222-2222", kid: "דני", car: { label: "מאזדה אדומה", seats: 3 } };

/** Tomorrow in the group's zone, so the legs are never "over" whatever time the suite runs. */
const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

async function createEventTomorrow(page: Page, groupId: string, title: string): Promise<string> {
  await page.getByRole("link", { name: he.group.newEvent }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/new$`));
  await page.getByRole("button", { name: he.newEvent.manual }).click();
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
    await a.page.getByRole("dialog").getByRole("button", { name: he.seatSheet.confirm }).click();
    await expect(seatedKid(a.page, A.kid)).toBeVisible();

    // --- A shares the per-event link from the event page ("my kids") ---
    await a.page.goto(eventUrl);
    const send = a.page.getByRole("link", { name: he.event.sendToKidLabel(A.kid) });
    await expect(send).toBeVisible();
    await expect(send).toContainText(he.event.sendToKid(A.kid));
    const href = (await send.getAttribute("href"))!;
    // The kid has no phone, so it's the chat chooser.
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = new URL(href).searchParams.get("text")!;
    expect(text).toContain(title);
    expect(text).toContain(he.wa.legLine("out", { family: he.family(B.name), departAt: "" }).replace(/ $/, ""));
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

    // --- Driver mode: the share card lists the kid with a wa.me link (to the parent: the kid has no phone) ---
    await b.page.goto(`${eventUrl}/drive/out`);
    const share = b.page.getByRole("region", { name: he.drive.shareTitle });
    await expect(share).toContainText(A.kid);
    const shareLink = share.getByRole("link", { name: he.drive.shareToParent(A.kid, A.parent) });
    await expect(shareLink).toHaveAttribute("href", /^https:\/\/wa\.me\/972521111111\?text=/);
    const shareText = new URL((await shareLink.getAttribute("href"))!).searchParams.get("text")!;
    expect(shareText).toContain(`/g/${groupId}/kid/${kidId}/e/${eventId}`);

    // --- "יצאתי": the kid page updates live (no reload). A is the only stop, so "next". ---
    await b.page.getByRole("button", { name: he.drive.start }).click();
    await expect(b.page.getByText(he.drive.onTheWay, { exact: true })).toBeVisible();
    await expect(share).toHaveClass(/\bhl\b/);
    await expect(outStatus).toHaveAttribute("data-status", /^(onTheWay|next)$/);
    await expect(outStatus).toContainText(he.kid.status.next);

    // --- "הגעתי" at the kid's stop → "דוד למטה!" ---
    await b.page.getByRole("button", { name: he.drive.arrivedLabel(A.kid) }).click();
    await expect(b.page.getByRole("button", { name: he.drive.arrivedLabel(A.kid) })).toHaveAttribute("aria-pressed", "true");
    await expect(outStatus).toHaveAttribute("data-status", "arrived");
    await expect(outStatus).toContainText(he.kid.status.arrived(B.parent));

    // --- Picked up → "עלית לרכב ✓" ---
    await b.page.getByRole("button", { name: he.drive.pickedBtn, exact: true }).click();
    await expect(b.page.getByRole("checkbox", { name: new RegExp(A.kid) })).toHaveAttribute("aria-checked", "true");
    await expect(outStatus).toHaveAttribute("data-status", "picked");
    await expect(outStatus).toContainText(he.kid.status.picked);
    await expect(backStatus).toHaveAttribute("data-status", "waiting");
  } finally {
    for (const u of users) await u.ctx.close();
  }
});
