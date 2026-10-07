import { expect, type Page, test } from "@playwright/test";
import { he } from "./helpers.ts";

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
