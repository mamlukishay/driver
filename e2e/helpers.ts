import { deflateSync } from "node:zlib";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { EventView, GroupResponse } from "../shared/types.ts";
import { he } from "../src/i18n/he.ts";

export { he };

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 5200}`;

export interface User {
  ctx: BrowserContext;
  page: Page;
}

/** A fresh browser context = a fresh phone (own localStorage, own identity). */
export async function newUser(browser: Browser, opts: { height?: number } = {}): Promise<User> {
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: opts.height ?? 844 },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

export interface FamilySpec {
  name: string;
  parent: string;
  phone: string;
  kid: string;
  car?: { label: string; seats?: number };
}

/** A slug unique enough for repeated runs against the same dev server. */
export const uniqueSlug = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Creates a group on the "my groups" flow (optionally with a custom URL name) and returns its slug and invite link. */
export async function createGroup(page: Page, groupName: string, slug?: string): Promise<{ groupId: string; inviteUrl: string }> {
  await page.goto("/");
  await page.getByRole("link", { name: he.home.create }).click();
  await expect(page).toHaveURL(/\/new-group$/);
  await page.getByLabel(he.newGroup.nameLabel).fill(groupName);
  if (slug) await page.getByLabel(he.newGroup.slugLabel).fill(slug);
  await page.getByRole("button", { name: he.newGroup.submit }).click();
  await expect(page.getByRole("heading", { name: he.newGroup.createdTitle })).toBeVisible();
  const inviteUrl = await page.getByLabel(he.newGroup.linkLabel).inputValue();
  const groupId = /\/join\/([a-z0-9-]+)$/.exec(inviteUrl)?.[1];
  if (!groupId) throw new Error(`unexpected invite link ${inviteUrl}`);
  return { groupId, inviteUrl };
}

/**
 * Fills the registration form and submits. Starts on `/join/:group?new=1` or on the "מי אתם?" screen
 * (where it taps "משפחה חדשה"). Ends on the page `next` points to (the group home by default).
 */
export async function registerFamily(page: Page, groupId: string, f: FamilySpec, ends: RegExp | null = new RegExp(`/g/${groupId}$`)): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/join/${groupId}\\?new=1|/g/${groupId}/who`));
  if (page.url().includes("/who")) await page.getByRole("link", { name: he.who.newFamily }).click();
  await expect(page).toHaveURL(new RegExp(`/join/${groupId}\\?new=1`));
  await page.getByLabel(he.form.familyName, { exact: true }).fill(f.name);
  // Live preview of how the family will be shown.
  await expect(page.locator("#fam-name-hint")).toHaveText(he.form.familyNameHint(f.name.trim()));
  await page.getByLabel(he.form.parentName, { exact: true }).fill(f.parent);
  await page.getByLabel(he.form.parentPhone, { exact: true }).fill(f.phone);
  await page.getByLabel(he.form.kidName, { exact: true }).fill(f.kid);
  if (f.car) {
    await page.getByRole("button", { name: he.form.addCar }).click();
    await page.getByLabel(he.form.carLabel).fill(f.car.label);
    const seats = f.car.seats ?? 4;
    for (let n = 4; n > seats; n--) await page.getByRole("button", { name: he.form.less }).click();
  }
  await page.getByRole("button", { name: he.join.submit }).click();
  if (ends) await expect(page).toHaveURL(ends);
}

/** On "מי אתם?": taps the family button whose label contains `label`, then confirms. */
export async function pickFamily(page: Page, label: string): Promise<void> {
  await expect(page.getByRole("heading", { name: he.who.title })).toBeVisible();
  await page.getByRole("button", { name: label }).click();
  const sheet = page.getByRole("dialog", { name: he.who.confirmTitle });
  await expect(sheet).toContainText(label);
  await sheet.getByRole("button", { name: he.who.confirm }).click();
}

/** Local date `days` from today as YYYY-MM-DD. */
export function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Creates an event through the manual form. Returns the event id. */
export async function createEventManually(page: Page, groupId: string, title: string, place = "פארק הירקון"): Promise<string> {
  await page.getByRole("link", { name: he.group.newEvent }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/new$`));
  await page.getByLabel(he.newEvent.fTitle, { exact: true }).fill(title);
  await page.getByLabel(he.newEvent.fPlace, { exact: true }).fill(place);
  await page.getByLabel(he.newEvent.fDate, { exact: true }).fill(isoInDays(7));
  await expect(page.getByLabel(he.newEvent.fStart, { exact: true })).toHaveValue("10:00");
  await page.getByRole("button", { name: he.newEvent.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${groupId}/e/[a-z0-9-]+$`));
  return eventIdFromUrl(page.url());
}

export const eventIdFromUrl = (url: string): string => {
  const id = /\/e\/([^/?#]+)/.exec(url)?.[1];
  if (!id) throw new Error(`no event id in ${url}`);
  return id;
};

/** Turns on the "מגיע/ה" switch for the (single) kid on the event page: both legs. */
export async function rsvpBothLegs(page: Page): Promise<void> {
  const coming = page.getByRole("switch", { name: he.event.coming, exact: true });
  await coming.click();
  await expect(coming).toBeChecked();
  await expect(page.getByRole("switch", { name: he.event.out, exact: true })).toBeChecked();
  await expect(page.getByRole("switch", { name: he.event.back, exact: true })).toBeChecked();
}

/** Publishes the family's (only) car on a leg from the board. Leaves the page on the board. */
export async function offerCar(page: Page, leg: "out" | "back"): Promise<void> {
  await page.getByRole("button", { name: he.board.offer(leg) }).click();
  await expect(page).toHaveURL(/sheet=car/);
  await page.getByRole("button", { name: he.carSheet.submit }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).not.toHaveURL(/sheet=/);
}

/** This device's stored family id for a group (`trempush.identities` = `{ [slug]: familyId }`). */
export async function identityOf(page: Page, groupId: string): Promise<string | null> {
  return page.evaluate((g) => {
    try {
      const all = JSON.parse(localStorage.getItem("trempush.identities") ?? "{}") as Record<string, string>;
      return all[g] ?? null;
    } catch {
      return null;
    }
  }, groupId);
}

export async function familyIdOf(page: Page, groupId: string): Promise<string> {
  const id = await identityOf(page, groupId);
  if (!id) throw new Error("no identity on this device");
  return id;
}

const hdr = (familyId: string | null) => (familyId ? { "X-Family-Id": familyId } : undefined);

export async function apiEvent(page: Page, groupId: string, eventId: string, familyId: string | null): Promise<EventView> {
  const r = await page.request.get(`/api/g/${groupId}/events/${eventId}`, { headers: hdr(familyId) });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as EventView;
}

export async function apiGroup(page: Page, groupId: string, familyId: string | null): Promise<GroupResponse> {
  const r = await page.request.get(`/api/g/${groupId}`, { headers: hdr(familyId) });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as GroupResponse;
}

/** The board's section listing kids waiting for a ride on a leg. */
export const waitingSection = (page: Page, leg: "out" | "back") => page.getByRole("region", { name: he.board.waiting(leg) });

/** A kid's seat button inside a car (aria-label from the dictionary). */
export const seatedKid = (page: Page, kid: string) => page.getByRole("button", { name: he.board.seatedKid(kid) });

/** The empty-seat button of a family's car. */
export const emptySeat = (page: Page, family: string) => page.getByRole("button", { name: he.board.emptySeat(he.family(family)) }).first();

/** The 10-second undo button in the toast. */
export const undoButton = (page: Page) => page.getByRole("status").getByRole("button", { name: new RegExp(`^${he.common.undo}`) });

/** Israeli mobile phone pattern as shown in the UI (050-123-4567) or raw (+972…). */
export const PHONE_RE = /0\d{2}-?\d{3}-?\d{4}|\+9725\d{8}|9725\d{8}/;

/** Minimal valid PNG (solid colour) built in-process, no image libraries. */
export function makePng(size = 64, rgb: [number, number, number] = [220, 90, 60]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Asserts that the first matching <img> actually decoded. */
export async function expectImageLoaded(img: ReturnType<Page["locator"]>): Promise<void> {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

export interface Scene {
  groupId: string;
  inviteUrl: string;
  eventId: string;
  eventUrl: string;
}

/** One family with a car, one event, the kid RSVPed for both legs. Page ends on the event page. */
export async function soloScene(page: Page, family: FamilySpec, groupName = "קבוצת בדיקה", eventTitle = "אירוע בדיקה"): Promise<Scene> {
  const { groupId, inviteUrl } = await createGroup(page, groupName);
  await page.getByRole("link", { name: he.newGroup.continue }).click();
  await registerFamily(page, groupId, family);
  const eventId = await createEventManually(page, groupId, eventTitle);
  await rsvpBothLegs(page);
  return { groupId, inviteUrl, eventId, eventUrl: `/g/${groupId}/e/${eventId}` };
}
