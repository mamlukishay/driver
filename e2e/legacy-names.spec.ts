import { expect, test } from "@playwright/test";
import type { GroupResponse } from "../shared/types.ts";
import { apiGroup, createGroup, familyIdOf, he, newUser, registerFamily, uniqueSlug, type User } from "./helpers.ts";

const A = { name: "כהן", parent: "רונית לוי", phone: "052-111-1111", kid: "נועה" };

let users: User[] = [];
test.afterEach(async () => {
  await Promise.all(users.map((u) => u.ctx.close()));
  users = [];
});

test("the server refuses \"undefined\"/\"null\" as a family, parent or kid name", async ({ browser }) => {
  const a = await newUser(browser);
  users.push(a);
  const { groupId } = await createGroup(a.page, "כיתה ב׳", uniqueSlug("junk"));
  await a.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(a.page, groupId, A);
  const familyId = await familyIdOf(a.page, groupId);
  const good = { name: "כהן", address: "", parents: [{ name: "רונית", phone: "052-111-1111" }], kids: [{ name: "נועה" }], cars: [] };
  const bads = [
    { ...good, name: "undefined" },
    { ...good, name: " null " },
    { ...good, parents: [{ name: "undefined", phone: "052-111-1111" }] },
    { ...good, kids: [{ name: "undefined" }] },
  ];
  for (const body of bads) {
    const reg = await a.page.request.post(`/api/g/${groupId}/families`, { data: body });
    expect(reg.status()).toBe(400);
    const put = await a.page.request.put(`/api/g/${groupId}/families/me`, { data: body, headers: { "X-Family-Id": familyId } });
    expect(put.status()).toBe(400);
  }
  expect((await apiGroup(a.page, groupId, familyId)).me?.name).toBe("כהן");
});

test("a family stored as \"undefined\" (legacy data) never shows it, and its page asks for a real name", async ({ browser }) => {
  const a = await newUser(browser);
  users.push(a);
  const { groupId } = await createGroup(a.page, "כיתה ג׳", uniqueSlug("legacy"));
  await a.page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(a.page, groupId, A);
  const familyId = await familyIdOf(a.page, groupId);

  // Serve the group as if the stored family were { name: "undefined", kids: [] } (the server no longer accepts it).
  const legacy = (g: GroupResponse): GroupResponse => {
    const bad = <T extends { id: string; name: string; kids: unknown[] }>(f: T): T => (f.id === familyId ? { ...f, name: "undefined", kids: [] } : f);
    return { ...g, families: g.families.map(bad), ...(g.me ? { me: bad(g.me) } : {}) };
  };
  await a.page.route(`**/api/g/${groupId}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, json: legacy((await res.json()) as GroupResponse) });
  });

  // My groups: no kids → the family label, which falls back to the parent's first name.
  await a.page.goto("/");
  const row = a.page.locator(".evcard", { hasText: "כיתה ג׳" });
  await expect(row.locator(".grp-kids")).toHaveText(he.family("רונית"));
  await expect(a.page.locator("body")).not.toContainText("undefined");

  // The family page: an empty, required name field (not the text "undefined").
  await a.page.goto(`/g/${groupId}/me`);
  const name = a.page.getByLabel(he.form.familyName, { exact: true });
  await expect(name).toHaveValue("");
  await expect(a.page.locator("#fam-name-hint")).toHaveText(he.form.requiredField);
  await expect(a.page.locator("body")).not.toContainText("undefined");

  // Saving forces a real name.
  await a.page.unroute(`**/api/g/${groupId}`);
  await a.page.getByRole("button", { name: he.common.save }).click();
  await expect(name).toBeFocused();
  await name.fill("כהן");
  await a.page.getByRole("button", { name: he.common.save }).click();
  await expect(a.page.getByText(he.profile.saved)).toBeVisible();
  expect((await apiGroup(a.page, groupId, familyId)).me?.name).toBe("כהן");
});
