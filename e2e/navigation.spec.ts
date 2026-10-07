import { expect, test } from "@playwright/test";
import { apiGroup, familyIdOf, he, newUser, offerCar, soloScene, type Scene, type User } from "./helpers.ts";

const FAMILY = { name: "כהן", parent: "רונית", phone: "052-111-1111", kid: "נועה", car: { label: "מאזדה אדומה", seats: 4 } };
const EVENT_TITLE = "טיול שנתי";

let user: User;
let scene: Scene;

test.beforeEach(async ({ browser }) => {
  user = await newUser(browser);
  scene = await soloScene(user.page, FAMILY, "קבוצת ניווט", EVENT_TITLE);
});

test.afterEach(async () => {
  await user.ctx.close();
});

test("every screen has its own URL", async () => {
  const { page } = user;
  const { groupId, eventUrl } = scene;
  const group = await apiGroup(page, groupId, await familyIdOf(page, groupId));
  const kidId = group.me!.kids[0]!.id;

  // Each deep link renders its own screen (an h1 that identifies it), never the not-found page.
  const screens: [string, string | RegExp][] = [
    ["/", he.appName],
    ["/new-group", he.newGroup.title],
    [`/join/${groupId}`, "קבוצת ניווט"],
    [`/g/${groupId}`, "קבוצת ניווט"],
    [`/g/${groupId}/new`, he.newEvent.title],
    [eventUrl, EVENT_TITLE],
    [`${eventUrl}/out`, `${EVENT_TITLE} · ${he.legName.out}`],
    [`${eventUrl}/back`, `${EVENT_TITLE} · ${he.legName.back}`],
    [`${eventUrl}/invite`, `${he.invite.title} · ${EVENT_TITLE}`],
    [`${eventUrl}/drive/out`, he.drive.title("out")],
    [`${eventUrl}/drive/back`, he.drive.title("back")],
    [`/g/${groupId}/me`, he.profile.title],
    [`/g/${groupId}/settings`, he.settings.title],
    [`/g/${groupId}/who`, "קבוצת ניווט"],
    [`/g/${groupId}/kid/${kidId}`, he.kid.hi(FAMILY.kid)],
  ];
  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading }), path).toBeVisible();
    await expect(page.getByRole("heading", { name: he.notFound.title })).toHaveCount(0);
  }

  // Unknown routes get the not-found screen.
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { name: he.notFound.title })).toBeVisible();

  // And in-app links change the URL the same way.
  await page.goto(`/g/${groupId}`);
  await page.getByRole("link", { name: new RegExp(EVENT_TITLE) }).click();
  await expect(page).toHaveURL(new RegExp(`${eventUrl}$`));
  await page.getByRole("link", { name: new RegExp(he.legName.out) }).first().click();
  await expect(page).toHaveURL(/\/out$/);
});

test("back and forward move between group, event tabs and drive mode", async () => {
  const { page } = user;
  const { eventUrl, groupId } = scene;
  const path = () => new URL(page.url()).pathname;

  // group -> event -> (tab, a replace) board (out)
  await page.goto(`/g/${groupId}`);
  await page.getByRole("link", { name: new RegExp(EVENT_TITLE) }).click();
  await expect(page).toHaveURL(new RegExp(`${eventUrl}$`));
  await page.getByRole("link", { name: new RegExp(he.legName.out) }).first().click();
  await expect(page).toHaveURL(new RegExp(`${eventUrl}/out$`));
  await offerCar(page, "out");
  await expect(page).toHaveURL(new RegExp(`${eventUrl}/out$`));

  // board -> drive
  await page.getByRole("link", { name: he.event.driveMode }).click();
  await expect(page).toHaveURL(new RegExp(`${eventUrl}/drive/out$`));
  await expect(page.getByRole("heading", { level: 1, name: he.drive.title("out") })).toBeVisible();

  // back: drive -> board -> group (tabs replace, so they don't pile up). The offer sheet left no stale entry.
  await page.goBack();
  await expect.poll(path).toBe(`${eventUrl}/out`);
  await expect(page.getByRole("heading", { level: 1, name: `${EVENT_TITLE} · ${he.legName.out}` })).toBeVisible();
  await page.goBack();
  await expect.poll(path).toBe(`/g/${groupId}`);

  // forward: group -> board -> drive
  await page.goForward();
  await expect.poll(path).toBe(`${eventUrl}/out`);
  await expect(page.getByRole("heading", { level: 1, name: `${EVENT_TITLE} · ${he.legName.out}` })).toBeVisible();
  await page.goForward();
  await expect.poll(path).toBe(`${eventUrl}/drive/out`);
  await expect(page.getByRole("heading", { level: 1, name: he.drive.title("out") })).toBeVisible();

  // The in-app back arrow always goes up: drive → event הילדים שלי → group. The entry behind each is the
  // board, not the parent, so each step replaces the entry instead of walking history.
  await page.getByRole("button", { name: he.common.back }).click();
  await expect.poll(path).toBe(eventUrl);
  await page.getByRole("button", { name: he.common.back }).click();
  await expect.poll(path).toBe(`/g/${groupId}`);
  // Browser back still works: the board entry is still behind.
  await page.goBack();
  await expect.poll(path).toBe(`${eventUrl}/out`);
});

test("the back arrow steps back when the previous entry is the parent", async () => {
  const { page } = user;
  const { eventUrl, groupId } = scene;
  const path = () => new URL(page.url()).pathname;
  await page.goto("/");
  await page.goto(`/g/${groupId}`);
  await page.getByRole("link", { name: new RegExp(EVENT_TITLE) }).click();
  await expect.poll(path).toBe(eventUrl);
  await page.getByRole("button", { name: he.common.back }).click();
  await expect.poll(path).toBe(`/g/${groupId}`);
  // It was a history step: forward returns to the event.
  await page.goForward();
  await expect.poll(path).toBe(eventUrl);
});

test("the header back arrow goes up the hierarchy without in-app history", async () => {
  const { page } = user;
  const { eventUrl, groupId } = scene;
  const path = () => new URL(page.url()).pathname;
  await page.goto("/");
  for (const [from, up] of [
    // (Each start differs from where the previous step landed, so `goto` is a fresh entry.)
    [eventUrl, `/g/${groupId}`],
    [`${eventUrl}/back`, eventUrl],
    [`${eventUrl}/invite`, eventUrl],
    [`${eventUrl}/drive/out`, eventUrl],
    [`/g/${groupId}`, "/"],
    [`/g/${groupId}/settings`, `/g/${groupId}`],
    [`/g/${groupId}/me`, `/g/${groupId}`],
    [`/g/${groupId}/new`, `/g/${groupId}`],
    [`/g/${groupId}/who`, `/g/${groupId}`],
  ] as const) {
    await page.goto(from);
    await page.getByRole("button", { name: he.common.back }).click();
    await expect.poll(path, from).toBe(up);
  }
});

test("a sheet pushes ?sheet= and back closes it without leaving the board", async () => {
  const { page } = user;
  const { eventUrl } = scene;
  await page.goto(`${eventUrl}/out`);
  const board = new RegExp(`${eventUrl}/out$`);
  await expect(page).toHaveURL(board);

  await page.getByRole("button", { name: he.board.offer("out") }).click();
  await expect(page).toHaveURL(/\/out\?sheet=car$/);
  const dialog = page.getByRole("dialog", { name: he.carSheet.titleNew("out") });
  await expect(dialog).toBeVisible();

  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(board);
  await expect(page.getByRole("heading", { level: 1, name: `${EVENT_TITLE} · ${he.legName.out}` })).toBeVisible();

  // Forward re-opens it; the close button also pops the entry instead of stacking another.
  await page.goForward();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: he.common.close }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(board);

  // A reload on an open sheet keeps it open (the sheet lives in the URL).
  await page.goto(`${eventUrl}/out?sheet=car`);
  await expect(page.getByRole("dialog", { name: he.carSheet.titleNew("out") })).toBeVisible();
});

test("scroll position is restored after back", async () => {
  const { page } = user;
  const { eventUrl } = scene;
  // Short viewport so the board is guaranteed to scroll.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto(`${eventUrl}/out`);
  await offerCar(page, "out");
  const drive = page.getByRole("link", { name: he.event.driveMode });
  await expect(drive).toBeVisible();

  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(max).toBeGreaterThan(120);
  const target = Math.min(max, 160);
  await page.evaluate((y) => scrollTo(0, y), target);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(target);
  // The position is persisted on a short debounce; wait until it is stored before navigating.
  await expect
    .poll(() => page.evaluate(() => Object.values(JSON.parse(sessionStorage.getItem("trempush.scroll") ?? "{}") as Record<string, number>).includes(Math.round(scrollY))))
    .toBe(true);

  // Navigate without letting Playwright scroll the link into view first.
  await drive.evaluate((el) => (el as HTMLElement).click());
  await expect(page).toHaveURL(/\/drive\/out$/);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBeLessThan(target);

  await page.goBack();
  await expect(page).toHaveURL(/\/out$/);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(target);
});

test("a deep link reload on the back leg works (SPA fallback)", async () => {
  const { page } = user;
  const backUrl = `${scene.eventUrl}/back`;
  const heading = page.getByRole("heading", { level: 1, name: `${EVENT_TITLE} · ${he.legName.back}` });

  await page.goto(backUrl);
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${backUrl}$`));
  await expect(heading).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(he.legName.back) }).first()).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".who")).toContainText(he.family(FAMILY.name));

  // A fresh browser (no history, no cache of ours) can open the same link too.
  const other = await user.ctx.browser()!.newContext({ baseURL: user.page.url().split("/g/")[0], locale: "he-IL" });
  try {
    const p = await other.newPage();
    await p.goto(backUrl);
    // No family on that phone: "מי אתם?" first, then "רק להסתכל" returns to the same link, view-only.
    await expect(p.getByRole("heading", { name: he.who.title })).toBeVisible();
    await p.getByRole("button", { name: he.who.justLook }).click();
    await expect(p).toHaveURL(new RegExp(`${backUrl}$`));
    await expect(p.getByRole("heading", { level: 1, name: `${EVENT_TITLE} · ${he.legName.back}` })).toBeVisible();
    await expect(p.getByText(he.identity.viewOnly)).toBeVisible();
  } finally {
    await other.close();
  }
});
