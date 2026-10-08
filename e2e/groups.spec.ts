import { expect, test } from "@playwright/test";
import { createEventManually, createGroup, he, newUser, uniqueSlug, type User } from "./helpers.ts";

let users: User[] = [];
test.afterEach(async () => {
  await Promise.all(users.map((u) => u.ctx.close()));
  users = [];
});

test("second group: registration copies the family, kids are picked per group; group name everywhere", async ({ browser }) => {
  const a = await newUser(browser);
  users.push(a);
  const p = a.page;
  const nameA = `כיתה ג׳ ${Date.now() % 1000}`;
  const nameB = `חוג כדור ${Date.now() % 1000}`;

  // Group A: family כהן with two kids and a car.
  const A = await createGroup(p, nameA, uniqueSlug("grp-a"));
  await p.getByRole("link", { name: he.newGroup.continue }).click();
  await expect(p).toHaveURL(new RegExp(`/join/${A.groupId}\\?new=1`));
  await expect(p.locator("#copy-from")).toHaveCount(0);
  await p.getByLabel(he.form.familyName, { exact: true }).fill("כהן");
  await p.getByLabel(he.form.parentName, { exact: true }).fill("רונית");
  await p.getByLabel(he.form.parentPhone, { exact: true }).fill("052-111-1111");
  await p.getByLabel(he.form.street).fill("הרצל 12");
  await p.getByLabel(he.form.city).fill("רעננה");
  await p.locator("#kid-0-name").fill("נועה");
  await p.getByRole("button", { name: he.form.addKid }).click();
  await p.locator("#kid-1-name").fill("איתי");
  await p.getByRole("button", { name: he.form.addCar }).click();
  await p.getByLabel(he.form.carLabel).fill("מאזדה");
  await p.getByLabel(he.form.carColor).fill("אדום");
  await p.getByLabel(he.form.carPlate).fill("123");
  await p.getByRole("button", { name: he.join.submit }).click();
  await expect(p).toHaveURL(new RegExp(`/g/${A.groupId}$`));
  await createEventManually(p, A.groupId, "יום ספורט");
  const eventA = p.url();

  // Group B: the form is copied from A; kids are unchecked choices.
  const B = await createGroup(p, nameB, uniqueSlug("grp-b"));
  await p.getByRole("link", { name: he.newGroup.continue }).click();
  await expect(p).toHaveURL(new RegExp(`/join/${B.groupId}\\?new=1`));
  await expect(p.locator("#copy-from")).toHaveValue(A.groupId);
  await expect(p.getByLabel(he.join.copyFrom)).toContainText(nameA);
  await expect(p.getByLabel(he.form.familyName, { exact: true })).toHaveValue("כהן");
  await expect(p.getByLabel(he.form.parentName, { exact: true })).toHaveValue("רונית");
  await expect(p.getByLabel(he.form.parentPhone, { exact: true })).toHaveValue(/052-?111-?1111/);
  await expect(p.getByLabel(he.form.street)).toHaveValue("הרצל 12");
  await expect(p.getByLabel(he.form.city)).toHaveValue("רעננה");
  await expect(p.getByLabel(he.form.carLabel)).toHaveValue("מאזדה");
  await expect(p.getByLabel(he.form.carColor)).toHaveValue("אדום");
  await expect(p.getByLabel(he.form.carPlate)).toHaveValue("123");
  await expect(p.getByRole("heading", { name: he.form.kidsPick })).toBeVisible();
  const noa = p.getByRole("checkbox", { name: /נועה/ });
  const itai = p.getByRole("checkbox", { name: /איתי/ });
  await expect(noa).not.toBeChecked();
  await expect(itai).not.toBeChecked();
  await expect(p.getByLabel(he.form.kidName, { exact: true })).toHaveCount(0);

  // At least one kid.
  await p.getByRole("button", { name: he.join.submit }).click();
  await expect(p.getByText(he.form.kidsPickRequired)).toBeVisible();
  await expect(p).toHaveURL(new RegExp(`/join/${B.groupId}\\?new=1`));
  await itai.check();
  await p.getByRole("button", { name: he.join.submit }).click();
  await expect(p).toHaveURL(new RegExp(`/g/${B.groupId}$`));
  await expect(p.getByRole("heading", { level: 1 })).toHaveText(nameB);

  // B's event: only איתי; the header shows B's name and the chip "משפחת כהן · B".
  await createEventManually(p, B.groupId, "משחק");
  const rsvpB = p.getByRole("region", { name: he.event.myKids });
  await expect(rsvpB).toContainText("איתי");
  await expect(rsvpB).not.toContainText("נועה");
  await expect(p.locator(".hdr-grp")).toHaveText(nameB);
  await expect(p.locator(".who")).toContainText(`${he.family("כהן")} · ${nameB}`);

  // A's event still has both kids.
  await p.goto(eventA);
  const rsvpA = p.getByRole("region", { name: he.event.myKids });
  await expect(rsvpA).toContainText("נועה");
  await expect(rsvpA).toContainText("איתי");
  await expect(p.locator(".hdr-grp")).toHaveText(nameA);
  await expect(p.locator(".who")).toContainText(`${he.family("כהן")} · ${nameA}`);

  // My groups: both, most recently used first, each with my kids there and the next event.
  await p.goto("/");
  const rows = p.locator(".list .evcard");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(nameA);
  await expect(rows.nth(0)).toContainText(he.joinNames(["נועה", "איתי"]));
  await expect(rows.nth(1)).toContainText(nameB);
  await expect(rows.nth(1).locator(".grp-kids")).toHaveText("איתי");
  await expect(rows.nth(0).locator(".grp-next")).toBeVisible();
});
