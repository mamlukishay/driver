import { expect, test } from "@playwright/test";
import {
  apiEvent,
  createEventManually,
  createGroup,
  he,
  identityOf,
  keyOf,
  newUser,
  offerCar,
  registerFamily,
  rsvpBothLegs,
  waitingSection,
  type User,
} from "./helpers.ts";

const A = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה" };
const B = { name: "לוי", parent: "דוד", phone: "054-222-2222", kid: "דני", car: { label: "מאזדה אדומה", seats: 4 } };

test("permissions, identity chip and a bad stored key", async ({ browser }) => {
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

    // Even if A forges the confirm sheet URL by hand, the server says no, in Hebrew.
    const bKey = await keyOf(b.page, groupId);
    const before = await apiEvent(b.page, groupId, eventId, bKey);
    const offer = before.offers.out[0]!;
    const bKid = before.families.find((f) => f.name === B.name)!.kids[0]!;
    expect(offer.kidIds).toEqual([]);
    await a.page.goto(`${eventUrl}/out?sheet=seat&kid=${bKid.id}&offer=${offer.id}`);
    const sheet = a.page.getByRole("dialog", { name: he.seatSheet.title });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: he.seatSheet.confirm }).click();
    await expect(a.page.getByText(he.errors.forbidden)).toBeVisible();

    // Nothing changed server-side: no seat, same version, B's page unchanged.
    const after = await apiEvent(b.page, groupId, eventId, bKey);
    expect(after.offers.out[0]!.kidIds).toEqual([]);
    expect(after.version).toBe(before.version);
    expect(after.log).toHaveLength(before.log.length);
    await expect(waitingSection(b.page, "out").getByRole("button", { name: B.kid })).toBeVisible();
    // A's own identity survived the refusal (a 403 on an action is not a bad key).
    expect(await identityOf(a.page, groupId)).not.toBeNull();

    // --- a bad stored key gets dropped: back to the unregistered view ---
    const id = (await identityOf(a.page, groupId))!;
    await a.page.evaluate(
      ({ g, key }) => {
        const all = JSON.parse(localStorage.getItem("trempush.identities") ?? "{}");
        all[g].key = key;
        localStorage.setItem("trempush.identities", JSON.stringify(all));
      },
      { g: groupId, key: `${id.familyId}.forgedsecret` },
    );
    await a.page.goto(`/g/${groupId}`);
    await expect(a.page.getByText(he.identity.viewOnly)).toBeVisible();
    await expect(a.page.getByRole("link", { name: he.group.joinCta }).first()).toBeVisible();
    await expect(a.page.getByText(he.group.viewOnlyNote)).toBeVisible();
    await expect.poll(() => identityOf(a.page, groupId)).toBeNull();
    // And it stays that way after a reload; the group is still readable (view-only).
    await a.page.reload();
    await expect(a.page.getByText(he.identity.viewOnly)).toBeVisible();
    await expect(a.page.getByRole("heading", { level: 1, name: "קבוצת הרשאות" })).toBeVisible();
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});
