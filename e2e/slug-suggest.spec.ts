import { expect, type Locator, type Page, test } from "@playwright/test";
import { eventSlugBase } from "../shared/slug.ts";
import { apiGroup, createGroup, familyIdOf, he, isoInDays, newUser } from "./helpers.ts";

/** Mocks `/api/config` (AI slug suggestion on) and the suggest endpoint (answers after `delayMs`); returns the request log. */
async function mockSuggest(page: Page, slug: string, delayMs: number): Promise<string[]> {
  const names: string[] = [];
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { features: { places: false, routes: false, inviteParse: false, slugSuggest: true } } }),
  );
  await page.route("**/api/groups/suggest-slug", async (route) => {
    names.push((route.request().postDataJSON() as { name: string }).name);
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ json: { slug } }).catch(() => {
      /* aborted by the page */
    });
  });
  return names;
}

test("Hebrew group name: one debounced AI request, spinner while pending, slug becomes the suggestion", async ({ page }) => {
  const names = await mockSuggest(page, "tomer-bar-mitzvah", 600);
  await page.goto("/new-group");
  const slugInput = page.getByLabel(he.newGroup.slugLabel);
  const fallback = await slugInput.inputValue();
  expect(fallback).toMatch(/^group-/);

  await page.getByLabel(he.newGroup.nameLabel).pressSequentially("בר מצווה לתומר", { delay: 40 });
  // Spinner (and the busy state) shows while the request is pending; the fallback stays meanwhile.
  await expect(page.locator(".fld .spin")).toBeVisible();
  await expect(slugInput).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status").filter({ hasText: he.newGroup.suggestingSlug })).toHaveCount(1);
  await expect(slugInput).toHaveValue(fallback);

  await expect(slugInput).toHaveValue("tomer-bar-mitzvah");
  await expect(page.locator(".fld .spin")).toHaveCount(0);
  await expect(slugInput).not.toHaveAttribute("aria-busy", "true");
  expect(names).toEqual(["בר מצווה לתומר"]);
});

test("a manual URL-name edit cancels the pending suggestion and is not overwritten", async ({ page }) => {
  const names = await mockSuggest(page, "tomer-bar-mitzvah", 800);
  await page.goto("/new-group");
  const slugInput = page.getByLabel(he.newGroup.slugLabel);

  await page.getByLabel(he.newGroup.nameLabel).fill("בר מצווה לתומר");
  await expect(page.locator(".fld .spin")).toBeVisible();
  await slugInput.fill("my-own-slug");
  await expect(page.locator(".fld .spin")).toHaveCount(0);
  await page.waitForTimeout(1200);
  await expect(slugInput).toHaveValue("my-own-slug");
  expect(names).toHaveLength(1);

  // Further name edits no longer touch the URL name or ask the AI.
  await page.getByLabel(he.newGroup.nameLabel).fill("בר מצווה לתומר ונועה");
  await page.waitForTimeout(800);
  await expect(slugInput).toHaveValue("my-own-slug");
  expect(names).toHaveLength(1);
});

test("Latin group name follows the name instantly, without an AI request", async ({ page }) => {
  const names = await mockSuggest(page, "should-not-be-used", 0);
  await page.goto("/new-group");
  await page.getByLabel(he.newGroup.nameLabel).pressSequentially("Class 4B", { delay: 30 });
  await expect(page.getByLabel(he.newGroup.slugLabel)).toHaveValue("class-4b");
  await page.waitForTimeout(800);
  expect(names).toHaveLength(0);
});

/* ---------- event word and kid link names (`POST /api/g/:group/suggest-slug`) ---------- */

/** Mocks `/api/config` (AI on) and the group-scoped suggest endpoint: `kind` → slug. Returns the request log. */
async function mockGroupSuggest(page: Page, slugs: { event?: string; kid?: string }, delayMs = 300): Promise<{ kind: string; name: string }[]> {
  const log: { kind: string; name: string }[] = [];
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { features: { places: false, routes: false, inviteParse: false, slugSuggest: true } } }),
  );
  await page.route("**/api/g/*/suggest-slug", async (route) => {
    const body = route.request().postDataJSON() as { kind: "event" | "kid"; name: string };
    log.push({ kind: body.kind, name: body.name });
    await new Promise((r) => setTimeout(r, delayMs));
    const slug = slugs[body.kind];
    await route.fulfill({ json: slug ? { slug } : {} }).catch(() => {
      /* aborted by the page */
    });
  });
  return log;
}

/** Registration with one kid; `kidSlug` checks or edits the kid's link field before submitting. */
async function registerWithKid(page: Page, groupId: string, family: string, kid: string, kidSlug: (field: Locator) => Promise<void>) {
  await page.goto(`/join/${groupId}?new=1`);
  await page.getByLabel(he.form.familyName, { exact: true }).fill(family);
  await page.getByLabel(he.form.parentName, { exact: true }).fill("הורה");
  await page.getByLabel(he.form.parentPhone, { exact: true }).fill("052-333-4444");
  await page.getByLabel(he.form.kidName, { exact: true }).fill(kid);
  await kidSlug(page.getByLabel(he.form.kidSlugLabel(kid)));
  await page.getByRole("button", { name: he.join.submit }).click();
}

test("new event: the English word is filled from the Hebrew title, until the user edits it", async ({ page }) => {
  const log = await mockGroupSuggest(page, { event: "tamir-bar-mitzvah" });
  const { groupId } = await createGroup(page, "כיתה ג׳");
  await registerWithKid(page, groupId, "כהן", "נועה", async () => {});
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}$`));

  await page.goto(`/g/${groupId}/new`);
  const word = page.getByLabel(he.newEvent.fSlugWord);
  const date = isoInDays(7);
  await page.getByLabel(he.newEvent.fDate, { exact: true }).fill(date);
  await page.getByLabel(he.newEvent.fTitle, { exact: true }).pressSequentially("בר המצווה של תמיר", { delay: 30 });
  await expect(word).toHaveValue("tamir-bar-mitzvah");
  await expect(page.locator("#ev-slug-hint")).toContainText(he.newEvent.slugWordSuggested);
  await expect(page.locator("#ev-slug-hint")).toContainText(eventSlugBase(date, "tamir-bar-mitzvah"));
  expect(log.filter((r) => r.kind === "event").map((r) => r.name)).toEqual(["בר המצווה של תמיר"]);

  // A typed word is kept: later title edits neither ask again nor overwrite it.
  await word.fill("tamir");
  await expect(page.locator("#ev-slug-hint")).not.toContainText(he.newEvent.slugWordSuggested);
  await page.getByLabel(he.newEvent.fTitle, { exact: true }).fill("בר המצווה של תמיר בגן");
  await page.waitForTimeout(900);
  await expect(word).toHaveValue("tamir");
  expect(log.filter((r) => r.kind === "event")).toHaveLength(1);

  await page.getByLabel(he.newEvent.fPlace, { exact: true }).fill("אולם");
  await page.getByRole("button", { name: he.newEvent.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/e/${eventSlugBase(date, "tamir")}$`));
});

test("kid link name: AI suggestion, edited by hand, unique in the group, old links keep working", async ({ browser }) => {
  const a = await newUser(browser);
  const b = await newUser(browser);
  try {
    const log = await mockGroupSuggest(a.page, { kid: "tuni" });
    const { groupId } = await createGroup(a.page, "כיתה ד׳");

    // Registration: the suggestion arrives, marked as one; the family corrects the spelling.
    await registerWithKid(a.page, groupId, "כהן", "תוני", async (field) => {
      await expect(field).toHaveValue("tuni");
      await expect(a.page.locator("#kid-0-slug-hint")).toHaveText(he.form.kidSlugSuggested);      await field.fill("toni");
      await expect(a.page.locator("#kid-0-slug-hint")).toHaveCount(0);
    });
    await expect(a.page).toHaveURL(new RegExp(`/g/${groupId}$`));
    expect(log.filter((r) => r.kind === "kid").map((r) => r.name)).toEqual(["תוני"]);
    const famId = await familyIdOf(a.page, groupId);
    const kid = (await apiGroup(a.page, groupId, famId)).me!.kids[0]!;
    expect(kid.slug).toBe("toni");

    // The slug link and the id link open the same kid page.
    for (const p of ["toni", kid.id]) {
      await a.page.goto(`/g/${groupId}/kid/${p}`);
      await expect(a.page.getByText(he.kid.hi("תוני"))).toBeVisible();
    }

    // Family page: the field shows the URL start and the saved name; renaming keeps the old link working.
    await a.page.goto(`/g/${groupId}/me`);
    const field = a.page.getByLabel(he.form.kidSlugLabel("תוני"));
    await expect(field).toHaveValue("toni");
    await expect(a.page.locator(".urlbox-pre")).toContainText(`/g/${groupId}/kid/`);    await field.fill("tony");
    await a.page.getByRole("button", { name: he.common.save }).click();
    await expect(a.page.getByText(he.profile.saved)).toBeVisible();
    for (const p of ["tony", "toni"]) {
      const r = await a.page.request.get(`/api/g/${groupId}/kid/${p}`);
      expect(r.ok()).toBeTruthy();
      expect(((await r.json()) as { kid: { id: string; slug?: string } }).kid).toMatchObject({ id: kid.id, slug: "tony" });
    }

    // Another family can't take the old name either (still reserved for that kid): an inline error.
    await mockGroupSuggest(b.page, {});
    await registerWithKid(b.page, groupId, "לוי", "Toni", async (f) => {
      await expect(f).toHaveValue("toni"); // a Latin name is suggested on the spot
    });
    await expect(b.page.locator("#kid-0-slug-hint")).toHaveText(he.form.kidSlugTaken);
    await expect(b.page).toHaveURL(new RegExp(`/join/${groupId}`));
    await b.page.getByLabel(he.form.kidSlugLabel("Toni")).fill("toni-l");
    await b.page.getByRole("button", { name: he.join.submit }).click();
    await expect(b.page).toHaveURL(new RegExp(`/g/${groupId}$`));
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});
