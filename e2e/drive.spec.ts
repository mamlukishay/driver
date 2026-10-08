import { expect, test, type Page } from "@playwright/test";
import type { EventView, FamilyInput, Leg, PublicAction } from "../shared/types.ts";
import { apiEvent, he, newUser, uniqueSlug, type User } from "./helpers.ts";

/**
 * Driver mode ("B · מסלול"). The scene is built through the API: the driver's family (own kid, car)
 * and two other families (one kid with a phone; two siblings without phones), all seated both ways.
 */

const DRIVER = { name: "לוי", parent: "דוד", kid: "איתי" };
const NOA = "נועה";
const SIBS = he.joinNames(["מאיה", "יואב"]);
const PLACE = "פארק הירקון";

const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

interface Scene {
  groupId: string;
  eventId: string;
  driverId: string;
  offer: Record<Leg, string>;
  kids: Record<string, string>;
}

async function post<T>(page: Page, path: string, familyId: string | null, data: unknown): Promise<T> {
  const r = await page.request.post(path, { data, headers: familyId ? { "X-Family-Id": familyId } : {} });
  expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy();
  return (await r.json()) as T;
}

async function act(page: Page, s: { groupId: string; eventId: string }, familyId: string, action: PublicAction): Promise<EventView> {
  return (await post<{ event: EventView }>(page, `/api/g/${s.groupId}/events/${s.eventId}/actions`, familyId, action)).event;
}

async function scene(page: Page): Promise<Scene> {
  const { groupId } = await post<{ groupId: string }>(page, "/api/groups", null, { name: "מצב נהג", slug: uniqueSlug("drv") });
  const fam = (input: FamilyInput) => post<{ familyId: string }>(page, `/api/g/${groupId}/families`, null, input).then((r) => r.familyId);
  const driverId = await fam({
    name: DRIVER.name,
    parents: [{ name: DRIVER.parent, phone: "054-222-2222" }],
    address: "הרא״ה 30, רמת גן",
    kids: [{ name: DRIVER.kid }],
    cars: [{ label: "מאזדה אדומה", seats: 6 }],
  });
  await fam({
    name: "כהן",
    parents: [{ name: "דנה", phone: "050-111-1111" }],
    address: "ז׳בוטינסקי 45, רמת גן",
    kids: [{ name: NOA, phone: "052-418-7730" }],
    cars: [],
  });
  await fam({
    name: "מזרחי",
    parents: [{ name: "רונית", phone: "054-662-9013" }],
    address: "ביאליק 12, רמת גן",
    kids: [{ name: "מאיה" }, { name: "יואב" }],
    cars: [],
  });
  const { eventId } = await post<{ eventId: string }>(page, `/api/g/${groupId}/events`, driverId, {
    title: "יום הולדת לנועה",
    date: tomorrow(),
    start: "16:30",
    returnTime: "19:00",
    place: PLACE,
    address: "שער רוקח, תל אביב",
  });
  const s = { groupId, eventId };
  const ev0 = await apiEvent(page, groupId, eventId, driverId);
  const kids: Record<string, string> = {};
  const famOf: Record<string, string> = {};
  for (const f of ev0.families) for (const k of f.kids) (kids[k.name] = k.id), (famOf[k.id] = f.id);
  // Seating order = pickup order: the driver's own kid, נועה, then the siblings.
  const order = [DRIVER.kid, NOA, "מאיה", "יואב"].map((n) => kids[n]!);
  for (const k of order) await act(page, s, famOf[k]!, { type: "setKidPlan", kidId: k, rsvp: "yes", out: true, back: true });
  const mineFam = ev0.families.find((f) => f.id === driverId)!;
  const carId = mineFam.cars[0]!.id;
  const person = mineFam.parents[0]!.id;
  const offer = {} as Record<Leg, string>;
  for (const leg of ["out", "back"] as const) {
    const ev = await act(page, s, driverId, { type: "offerCar", leg, carId, driverId: person, seats: 6, departAt: leg === "out" ? "16:00" : "18:45" });
    offer[leg] = ev.offers[leg].find((o) => o.familyId === driverId)!.id;
    for (const k of order) await act(page, s, driverId, { type: "seatKid", offerId: offer[leg], kidId: k });
  }
  return { groupId, eventId, driverId, offer, kids };
}

/** Acts as the driver's family on this phone and opens driver mode. */
async function openDrive(page: Page, s: Scene, leg: Leg) {
  await page.goto("/");
  await page.evaluate(([g, id]) => localStorage.setItem("trempush.identities", JSON.stringify({ [g!]: id })), [s.groupId, s.driverId]);
  await page.goto(`/g/${s.groupId}/e/${s.eventId}/drive/${leg}`);
  await expect(page.getByRole("heading", { level: 1, name: he.drive.title(leg) })).toBeVisible();
}

const route = (page: Page) => page.getByRole("list", { name: he.drive.route });

let user: User;
test.beforeEach(async ({ browser }) => {
  user = await newUser(browser);
});
test.afterEach(async () => {
  await user.ctx.close();
});

test("out leg: departure sheet per other family, pick up in any order, a done stop steps back", async () => {
  const { page } = user;
  const s = await scene(page);
  await openDrive(page, s, "out");

  // Before "יצאתי": own kid rides along, two stops, no step buttons.
  await expect(page.getByText(he.drive.plan(2, "16:00"))).toBeVisible();
  await expect(page.locator(".own")).toContainText(DRIVER.kid);
  await expect(page.locator(".own")).toContainText(he.drive.ownInCar);
  await expect(route(page)).not.toContainText(DRIVER.kid);
  await expect(page.getByRole("button", { name: he.drive.arriveLabel(NOA) })).toHaveCount(0);

  // "יצאתי" → "לעדכן את הנוסעים?": one row per other family, never the driver's own.
  await page.getByRole("button", { name: he.drive.start, exact: true }).click();
  const depart = page.getByRole("dialog", { name: he.drive.departTitle });
  await expect(depart).toBeVisible();
  await expect(depart.locator(".nrow")).toHaveCount(2);
  await expect(depart).toContainText(he.family("כהן"));
  await expect(depart).toContainText(he.family("מזרחי"));
  await expect(depart).not.toContainText(he.family(DRIVER.name));
  // To the kid's own phone when there is one, else to the parent; the kid's tracking link last.
  const toNoa = depart.getByRole("link", { name: he.drive.sendLabel(NOA) });
  await expect(toNoa).toHaveAttribute("href", /^https:\/\/wa\.me\/972524187730\?text=/);
  const noaText = new URL((await toNoa.getAttribute("href"))!).searchParams.get("text")!;
  expect(noaText).toContain(`/g/${s.groupId}/kid/${s.kids[NOA]}/e/${s.eventId}`);
  const toRonit = depart.getByRole("link", { name: he.drive.sendLabel("רונית") });
  await expect(toRonit).toHaveAttribute("href", /^https:\/\/wa\.me\/972546629013\?text=/);
  const ronitText = new URL((await toRonit.getAttribute("href"))!).searchParams.get("text")!;
  expect(ronitText).toContain(SIBS);
  expect(ronitText).toContain(`/g/${s.groupId}/kid/${s.kids["מאיה"]}/e/${s.eventId}`);
  // Tapping send marks the row "נשלח ✓" (kept across a reload, i.e. the WhatsApp round-trip).
  const [popup] = await Promise.all([page.waitForEvent("popup"), toNoa.click()]);
  await popup.close();
  await expect(depart.locator(".nrow").first().getByText(he.drive.sent)).toBeVisible();
  // The sheet lives in `?sheet=`, so a reload reopens it.
  await page.reload();
  await expect(depart.locator(".nrow").first().getByText(he.drive.sent)).toBeVisible();
  await depart.getByRole("button", { name: he.drive.finish }).click();
  await expect(depart).toBeHidden();
  // "עדכון הנוסעים" reopens it.
  await page.getByRole("button", { name: he.drive.notifyAgain }).click();
  await expect(depart.locator(".nrow").first().getByText(he.drive.sent)).toBeVisible();
  await depart.getByRole("button", { name: he.common.close }).click();
  await expect(depart).toBeHidden();

  // Progress counts kids at stops only (not the driver's own kid).
  await expect(page.getByText(he.drive.progress(0, 3))).toBeVisible();
  // The first stop is expanded: the navigation button goes there, in Waze by default.
  await expect(page.getByRole("link", { name: he.drive.navIn(NOA, "Waze") })).toHaveAttribute("href", /^https:\/\/waze\.com\/ul\?q=/);

  // Stop 2 before stop 1, with its own compact button: הגעתי → אספתי ✓.
  await page.getByRole("button", { name: he.drive.arriveLabel(SIBS) }).click();
  await page.getByRole("button", { name: he.drive.pickLabel(SIBS) }).click();
  await expect(page.getByText(he.drive.progress(2, 3))).toBeVisible();
  await expect(page.getByRole("button", { name: he.drive.stepBackLabel(SIBS) })).toBeVisible();

  // Stop 1: הגעתי shows what the kid page says, then אספתי ✓ → everyone's in.
  await page.getByRole("button", { name: he.drive.arriveLabel(NOA) }).click();
  await expect(page.getByTestId("kid-sees")).toHaveText(he.drive.kidSees(NOA, he.kid.status.arrived(DRIVER.parent)));
  await page.getByRole("button", { name: he.drive.pickLabel(NOA) }).click();
  await expect(page.getByText(he.drive.allIn)).toBeVisible();
  // Bar: navigate to the venue + "הגענו".
  await expect(page.getByRole("link", { name: he.drive.navIn(PLACE, "Waze") })).toBeVisible();
  await expect(page.locator(".drv-bar").getByRole("button", { name: he.drive.end })).toBeVisible();

  // Tapping a done stop takes it back one step: picked → arrived. No toast.
  await page.getByRole("button", { name: he.drive.stepBackLabel(NOA) }).click();
  await expect(page.getByText(he.drive.progress(2, 3))).toBeVisible();
  await expect(page.getByRole("button", { name: he.drive.pickLabel(NOA) })).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0);
  const ev = await apiEvent(page, s.groupId, s.eventId, s.driverId);
  const run = ev.offers.out.find((o) => o.id === s.offer.out)!.run!;
  expect(run.picked).toEqual(expect.arrayContaining([s.kids["מאיה"], s.kids["יואב"]]));
  expect(run.picked).not.toContain(s.kids[NOA]);
  expect(run.arrived).toContain(s.kids[NOA]);
});

// Needs the setEta / endRun reducer cases and the own-kid auto-pick at startRun.
test("out leg: time chip, own kid auto-picked, הגענו and back to the ride", async () => {
  const { page } = user;
  const s = await scene(page);
  await openDrive(page, s, "out");
  await page.getByRole("button", { name: he.drive.start, exact: true }).click();
  await page.getByRole("dialog", { name: he.drive.departTitle }).getByRole("button", { name: he.drive.skip }).click();

  // The driver's own kid is in the car from the start.
  const ev = await apiEvent(page, s.groupId, s.eventId, s.driverId);
  expect(ev.offers.out.find((o) => o.id === s.offer.out)!.run!.picked).toContain(s.kids[DRIVER.kid]);

  // "כמה זמן עד שאגיע?" → the line shows what the kid page now says.
  await expect(page.getByTestId("kid-sees")).toHaveText(he.drive.kidSeesNoEta(NOA));
  const chip = page.getByRole("group", { name: he.drive.etaLabel(NOA) }).getByRole("button", { name: he.drive.etaChip(5), exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("kid-sees")).toContainText(he.drive.kidSeesEta(""));
  await expect(page.getByTestId("kid-sees")).toHaveText(/\d{2}:\d{2}/);

  // "הגענו" on the venue node, any time after "יצאתי": the done state, then back to the ride.
  await route(page).getByRole("button", { name: he.drive.end }).click();
  await expect(page.getByRole("heading", { name: he.drive.done })).toBeVisible();
  await expect(page.getByText(he.drive.doneKids("out"))).toBeVisible();
  await expect(page.locator(".drv-bar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: he.drive.toEvent })).toHaveAttribute("href", `/g/${s.groupId}/e/${s.eventId}`);
  await page.getByRole("button", { name: he.drive.resume }).click();
  await expect(page.getByText(he.drive.progress(0, 3))).toBeVisible();
});

test("back leg: one stop at the venue, a toggle per kid, then the homes as navigation targets", async () => {
  const { page } = user;
  const s = await scene(page);
  await openDrive(page, s, "back");
  // The driver's own kid boards at the venue like everyone else.
  await expect(page.locator(".own")).toHaveCount(0);
  await page.getByRole("button", { name: he.drive.start, exact: true }).click();
  await page.getByRole("dialog", { name: he.drive.departTitle }).getByRole("button", { name: he.drive.skip }).click();
  await expect(page.getByText(he.drive.progress(0, 4))).toBeVisible();
  await expect(page.getByRole("link", { name: he.drive.navIn(PLACE, "Waze") })).toBeVisible();

  await page.getByRole("button", { name: he.drive.arriveLabel(PLACE) }).click();
  for (const k of [NOA, DRIVER.kid, "מאיה"]) await page.getByRole("button", { name: he.drive.pickLabel(k) }).click();
  await expect(page.getByText(he.drive.progress(3, 4))).toBeVisible();
  // A kid's toggle steps back on its own.
  await page.getByRole("button", { name: he.drive.pickLabel(NOA) }).click();
  await expect(page.getByText(he.drive.progress(2, 4))).toBeVisible();
  await page.getByRole("button", { name: he.drive.pickLabel(NOA) }).click();
  await page.getByRole("button", { name: he.drive.pickLabel("יואב") }).click();
  await expect(page.getByText(he.drive.allIn)).toBeVisible();

  // Everyone in: navigate to the first home; tapping another home makes it the target.
  await expect(page.getByRole("link", { name: he.drive.navIn(NOA, "Waze") })).toBeVisible();
  await page.getByRole("button", { name: he.drive.dropOff(SIBS) }).click();
  await expect(page.getByRole("link", { name: he.drive.navIn(SIBS, "Waze") })).toHaveAttribute("href", /%D7%91%D7%99%D7%90%D7%9C%D7%99%D7%A7/);
});

test("navigation app: the selector switches the logo, survives a reload and matches Settings", async () => {
  const { page } = user;
  const s = await scene(page);
  await act(page, s, s.driverId, { type: "startRun", offerId: s.offer.out });
  await openDrive(page, s, "out");

  const bar = page.locator(".drv-bar");
  await expect(bar.locator(".nlogo")).toHaveAttribute("data-app", "waze");
  await bar.getByRole("button", { name: he.drive.navPick }).click();
  const picker = page.getByRole("dialog", { name: he.drive.navWith });
  await expect(picker.getByRole("button", { name: "Waze" })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Google Maps" }).click();
  await expect(picker).toBeHidden();
  await expect(bar.locator(".nlogo")).toHaveAttribute("data-app", "gmaps");
  const nav = page.getByRole("link", { name: he.drive.navIn(NOA, "Google Maps") });
  await expect(nav).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=.+&travelmode=driving$/);

  await page.reload();
  await expect(bar.locator(".nlogo")).toHaveAttribute("data-app", "gmaps");

  // Settings shows the same per-phone choice; changing it there changes driver mode.
  await page.goto(`/g/${s.groupId}/settings`);
  const seg = page.getByRole("radiogroup", { name: he.settings.navApp });
  await expect(seg.getByRole("radio", { name: "Google Maps" })).toHaveAttribute("aria-checked", "true");
  await seg.getByRole("radio", { name: "Waze" }).click();
  await expect(seg.getByRole("radio", { name: "Waze" })).toHaveAttribute("aria-checked", "true");
  await page.goto(`/g/${s.groupId}/e/${s.eventId}/drive/out`);
  await expect(page.getByRole("link", { name: he.drive.navIn(NOA, "Waze") })).toBeVisible();
});
