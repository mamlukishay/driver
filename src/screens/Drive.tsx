/**
 * Driver mode ("B · מסלול"): a vertical route from home through each stop to the venue (out), or
 * from home to the venue and then the homes (back). Any stop can be acted on in any order; the
 * expanded stop is the one last tapped, else the first not picked up. One control per stop steps
 * הגעתי → אספתי ✓; tapping a done stop steps it back. No undo toasts on this screen (KISS).
 */
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import type { EventView, FamilyView, Leg, Offer, PublicAction } from "../../shared/types.ts";
import { fullAddress } from "../../shared/address.ts";
import { familyDisplayName } from "../../shared/familyLabel.ts";
import { formatPhoneLocal, telHref } from "../../shared/phone.ts";
import { pickupStops } from "../../shared/view.ts";
import { DepartCheck } from "../components/CarCard.tsx";
import { Header } from "../components/Header.tsx";
import { Avatar } from "../components/KidChip.tsx";
import { NAV_APP_NAME, NavLogo } from "../components/NavLogo.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { PhoneIcon, WaButton, WaIcon } from "../components/WaButton.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useSheet } from "../nav.ts";
import { NAV_APPS, navUrl, setNavApp, useNavApp } from "../navApp.ts";
import { useEvent } from "../store.ts";
import { appUrl, cx, eventIndex, fmtClock, kidPath } from "../util.ts";
import { EventHead, runAction, runActions } from "./eventCommon.tsx";

export function Drive({ group, event, leg }: { group: string; event: string; leg: Leg }) {
  const res = useEvent(group, event);
  useLive(group);
  const ev = res.data;
  const valid = leg === "out" || leg === "back";
  return (
    <>
      <Header title={he.drive.title(valid ? leg : "out")} up={`/g/${group}/e/${event}`} group={group} groupLine />
      <main id="main" class="content drive">
        {!valid ? (
          <ErrorState code="not_found" />
        ) : res.error && !ev ? (
          <ErrorState code={res.error} onRetry={res.reload} />
        ) : !ev ? (
          <Loading />
        ) : (
          <DriveBody group={group} ev={ev} leg={leg} />
        )}
      </main>
    </>
  );
}

function DriveBody({ group, ev, leg }: { group: string; ev: EventView; leg: Leg }) {
  // A family with several cars on this leg: the board links each with `?offer=<id>`.
  const want = useLocation().query.offer;
  const mine = ev.offers[leg].filter((o) => o.familyId === ev.me);
  const offer = mine.find((o) => o.id === want) ?? mine[0];
  if (!offer)
    return (
      <>
        <EventHead group={group} ev={ev} />
        <p class="note">{he.drive.noOffer}</p>
        <a class="btn big" href={`/g/${group}/e/${ev.id}/${leg}`}>
          {he.drive.toBoard}
        </a>
      </>
    );
  return <DriveRun key={offer.id} group={group} ev={ev} leg={leg} offer={offer} />;
}

/* ---------- model ---------- */

/** A pickup stop: one family's kids (out), or everyone at the venue (back, `venue`). */
interface Stop {
  key: string;
  kids: string[];
  fam: FamilyView | null;
  venue: boolean;
}
/** 0 = on the way, 1 = "הגעתי" (the unpicked kids are arrived), 2 = everyone at the stop picked up. */
type Step = 0 | 1 | 2;
interface FamKids {
  fam: FamilyView;
  kids: string[];
}

const SHEET_DEPART = "depart";
const SHEET_CONTACT = "contact";
const SHEET_NAVAPP = "navapp";
const ETA_CHIPS = [2, 5, 10, 15];

function driveModel(ev: EventView, leg: Leg, offer: Offer) {
  const idx = eventIndex(ev);
  const kidIds = offer.kidIds.filter((k) => idx.kid(k));
  const famOf = (k: string) => idx.kid(k)?.family.id;
  // Out: the driver's own kids ride from home; they are never a stop.
  const own = leg === "out" ? kidIds.filter((k) => famOf(k) === offer.familyId) : [];
  const stopKids = kidIds.filter((k) => !own.includes(k));
  const stops: Stop[] = pickupStops(leg, stopKids, famOf).map((kids) =>
    leg === "back"
      ? { key: "venue", kids, fam: null, venue: true }
      : { key: famOf(kids[0]!)!, kids, fam: idx.kid(kids[0]!)!.family, venue: false },
  );
  const run = offer.run;
  const picked = new Set(run?.picked ?? []);
  const arrived = new Set(run?.arrived ?? []);
  const unpicked = (s: Stop) => s.kids.filter((k) => !picked.has(k));
  const step = (s: Stop): Step => {
    const un = unpicked(s);
    if (un.length === 0) return 2;
    return un.some((k) => arrived.has(k)) ? 1 : 0;
  };
  const counted = stops.flatMap((s) => s.kids);
  const nPicked = counted.filter((k) => picked.has(k)).length;
  // Families in the car, in seating order.
  const fams: FamKids[] = [];
  for (const k of kidIds) {
    const f = idx.kid(k)!.family;
    const g = fams.find((x) => x.fam.id === f.id);
    if (g) g.kids.push(k);
    else fams.push({ fam: f, kids: [k] });
  }
  const others = fams.filter((f) => f.fam.id !== offer.familyId);
  // Back: drop-offs, the other families in seating order, then the driver's own home.
  const homes = leg === "back" ? [...others, ...fams.filter((f) => f.fam.id === offer.familyId)] : [];
  return {
    idx,
    kidIds,
    own,
    stops,
    picked,
    arrived,
    unpicked,
    step,
    counted,
    nPicked,
    allIn: !!run && nPicked === counted.length,
    others,
    homes,
  };
}

type Model = ReturnType<typeof driveModel>;

const names = (m: Model, kids: string[]) => he.joinNames(kids.map(m.idx.kidName));
/** The street only (compact rows); full addresses and navigation use `fullAddress`. */
const shortAddr = (a: string | undefined) => (a ?? "").split(",")[0]!.trim();

/** When each kid was picked up, from the event log (the log is a tail, so only "if known"). */
function pickTimes(ev: EventView): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ev.log) {
    const a = e.action;
    if (a.type !== "setPicked" || !a.picked || e.undoneBy) continue;
    if ((out.get(a.kidId) ?? 0) < e.at) out.set(a.kidId, e.at);
  }
  return out;
}

/* ---------- "נשלח ✓" per family, kept for this tab across the WhatsApp round-trip ---------- */

const SENT_KEY = "trempush.departSent";
function loadSent(offerId: string): string[] {
  try {
    const all = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "{}") as Record<string, unknown>;
    const v = all[offerId];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function saveSent(offerId: string, fams: string[]): void {
  try {
    const all = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "{}") as Record<string, string[]>;
    all[offerId] = fams;
    sessionStorage.setItem(SENT_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: this view only */
  }
}

/* ---------- the screen ---------- */

function DriveRun({ group, ev, leg, offer }: { group: string; ev: EventView; leg: Leg; offer: Offer }) {
  const m = driveModel(ev, leg, offer);
  const { idx } = m;
  const sheet = useSheet();
  const [focus, setFocus] = useState<string | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>(() => loadSent(offer.id));
  const run = offer.run;
  const frozen = !!ev.cancelled;
  const offerId = offer.id;
  const driverFam = idx.fam(offer.familyId);
  const driver = idx.driver(offer)?.name || he.family(driverFam ? familyDisplayName(driverFam) : "");
  const venueAddr = ev.address || ev.place;
  const times = pickTimes(ev);

  const act = async (actions: PublicAction[]) => {
    if (busy || actions.length === 0) return;
    setBusy(true);
    await runActions(group, ev, actions);
    setBusy(false);
  };
  const stepFwd = (s: Stop) => {
    const un = m.unpicked(s);
    const st = m.step(s);
    if (st === 0) void act(un.map((kidId) => ({ type: "setArrived", offerId, kidId, arrived: true })));
    else if (st === 1) void act(un.map((kidId) => ({ type: "setPicked", offerId, kidId, picked: true })));
  };
  // The only undo: a done stop goes back to "הגעתי".
  const stepBack = (kids: string[]) =>
    void act(
      kids
        .filter((k) => m.picked.has(k))
        .flatMap((kidId): PublicAction[] => [
          { type: "setPicked", offerId, kidId, picked: false },
          { type: "setArrived", offerId, kidId, arrived: true },
        ]),
    );
  const pickKid = (kidId: string) => (m.picked.has(kidId) ? stepBack([kidId]) : void act([{ type: "setPicked", offerId, kidId, picked: true }]));
  const setEta = (s: Stop, minutes: number) => void act([{ type: "setEta", offerId, kidIds: m.unpicked(s), minutes }]);
  const end = (ended: boolean) => void act([{ type: "endRun", offerId, ended }]);
  const start = async () => {
    setBusy(true);
    const ok = await runAction(group, ev, { type: "startRun", offerId }, "", { undo: false });
    setBusy(false);
    if (ok && m.others.length) sheet.open(SHEET_DEPART);
  };
  const markSent = (famId: string) => {
    if (sent.includes(famId)) return;
    const next = [...sent, famId];
    setSent(next);
    saveSent(offerId, next);
  };

  // The expanded stop: the one last tapped (unless done), else the first not picked up (once going).
  const tapped = m.stops.find((s) => s.key === focus && m.step(s) < 2);
  const expanded = tapped ?? (run ? m.stops.find((s) => m.step(s) < 2) : undefined);

  // Navigation target.
  const venueTarget = { text: he.drive.navTo(ev.place), label: ev.place, addr: venueAddr };
  const homeTarget = (h: FamKids) => {
    const mine = h.fam.id === offer.familyId;
    const label = mine ? he.drive.home2 : names(m, h.kids);
    return { text: mine ? he.drive.navHome : he.drive.navTo(label), label, addr: fullAddress(h.fam) || null };
  };
  let target: { text: string; label: string; addr: string | null } | null = null;
  if (run) {
    const tappedHome = m.homes.find((h) => h.fam.id === home);
    if (leg === "back" && (tappedHome || m.allIn)) target = m.homes.length ? homeTarget(tappedHome ?? m.homes[0]!) : null;
    else if (!m.allIn && expanded && !expanded.venue) {
      const label = names(m, expanded.kids);
      target = { text: he.drive.navTo(label), label, addr: (expanded.fam && fullAddress(expanded.fam)) || null };
    } else target = venueTarget;
  }
  const selHome = leg === "back" && run && target ? (m.homes.find((h) => h.fam.id === home) ?? (m.allIn ? m.homes[0] : undefined)) : undefined;

  const ownLine = m.own.length > 0 && (
    <p class="own">
      <span class="avs">
        {m.own.map((k) => (
          <Avatar name={m.idx.kidName(k)} color={idx.kid(k)!.family.color} />
        ))}
      </span>
      <span>
        <b>{names(m, m.own)}</b> {he.drive.ownInCar}
      </span>
    </p>
  );

  const contactKid = sheet.name === SHEET_CONTACT && typeof sheet.query.kid === "string" && m.kidIds.includes(sheet.query.kid) ? sheet.query.kid : null;

  const sheets = (
    <>
      <Sheet open={sheet.name === SHEET_DEPART && !!run} title={he.drive.departTitle} onClose={sheet.close}>
        <DepartBody group={group} ev={ev} m={m} sent={sent} onSent={markSent} onClose={sheet.close} />
      </Sheet>
      <Sheet open={!!contactKid} title={contactKid ? names(m, contactSet(m, leg, contactKid)) : ""} onClose={sheet.close}>
        {contactKid && <ContactBody m={m} leg={leg} kidId={contactKid} />}
      </Sheet>
      <Sheet open={sheet.name === SHEET_NAVAPP} title={he.drive.navWith} onClose={sheet.close}>
        <NavAppBody onPick={sheet.close} />
      </Sheet>
    </>
  );

  const head = (
    <>
      <EventHead group={group} ev={ev} />
      {(idx.fam(offer.familyId)?.parents.length ?? 0) > 1 && (
        <p class="small muted">{he.drive.driverLine(idx.driver(offer)?.name ?? "?", idx.car(offer.familyId, offer.carId)?.label ?? "")}</p>
      )}
      {frozen && (
        <p class="note cancel-note" role="status">
          <b>{he.manage.cancelled}</b>
          <span class="small">{he.manage.cancelledNote}</span>
        </p>
      )}
      {offer.departAtCheck && !frozen && (
        <DepartCheck onConfirm={() => runAction(group, ev, { type: "confirmDeparture", offerId }, he.manage.toastConfirmed)} />
      )}
    </>
  );

  if (run?.endedAt)
    return (
      <>
        {head}
        <section class="drv-done" aria-labelledby="done-h">
          <span class="lbl2">{he.drive.doneLabel}</span>
          <h2 id="done-h" class="rt-names">
            {he.drive.done}
          </h2>
          {leg === "out" && (
            <p class="rt-addr">
              <PinIcon />
              <span>{ev.address && ev.address !== ev.place ? `${ev.place}, ${ev.address}` : ev.place}</span>
            </p>
          )}
          <p>
            <b class="num">
              {he.drive.pax(run.picked.length)} · {fmtClock(run.endedAt)}
            </b>
          </p>
          <p class="kidsee">{he.drive.doneKids(leg)}</p>
        </section>
        {ownLine}
        <div class="row drv-links">
          <button type="button" class="lnk" onClick={() => end(false)} disabled={busy}>
            {he.drive.resume}
          </button>
          <a class="lnk" href={`/g/${group}/e/${ev.id}`}>
            {he.drive.toEvent}
          </a>
        </div>
        {sheets}
      </>
    );

  const legTime = leg === "out" ? ev.start : ev.returnTime;
  const endBtn = (
    <button type="button" class="btn sm ghost" onClick={() => end(true)} disabled={busy}>
      {he.drive.end}
    </button>
  );

  return (
    <>
      {head}
      <div class="drv-prog">
        <b>{!run ? he.drive.plan(m.stops.length, offer.departAt) : m.allIn ? he.drive.allIn : he.drive.progress(m.nPicked, m.counted.length)}</b>
        {run && m.others.length > 0 && (
          <button type="button" class="lnk" onClick={() => sheet.open(SHEET_DEPART)}>
            {he.drive.notifyAgain}
          </button>
        )}
      </div>
      {ownLine}
      {m.kidIds.length === 0 ? (
        <p class="small muted">{he.drive.noKids}</p>
      ) : (
        <ol class="rt" aria-label={he.drive.route}>
          <li class={cx("rt-n", run && "done")}>
            <span class="rt-m" aria-hidden="true">
              {run ? "✓" : ""}
            </span>
            <div class="rt-t">
              <b>{he.drive.home}</b>
              <small>
                {driverFam?.address ? `${shortAddr(driverFam.address)} · ` : ""}
                <span class="num">{run ? he.drive.leftAt(fmtClock(run.startedAt)) : offer.departAt}</span>
              </small>
            </div>
          </li>
          {m.stops.map((s, i) => {
            const st = m.step(s);
            const title = s.venue ? ev.place : names(m, s.kids);
            const ready = st < 2 && s.kids.some((k) => !m.picked.has(k) && offer.ready?.includes(k));
            const avs = (lg?: boolean) => (
              <span class="avs">
                {s.kids.map((k) => (
                  <Avatar name={idx.kidName(k)} color={idx.kid(k)!.family.color} size={lg ? "lg" : undefined} />
                ))}
              </span>
            );
            if (st === 2) {
              const t = Math.max(0, ...s.kids.map((k) => times.get(k) ?? 0));
              return (
                <li class="rt-n done">
                  <span class="rt-m" aria-hidden="true">
                    ✓
                  </span>
                  <button type="button" class="rt-row" onClick={() => stepBack(s.kids)} disabled={busy} aria-label={he.drive.stepBackLabel(title)}>
                    {avs()}
                    <span class="grow1">
                      <b>{title}</b>
                      <small>
                        {he.drive.pickedAt(t ? fmtClock(t) : null)} · {he.drive.tapBack}
                      </small>
                    </span>
                  </button>
                </li>
              );
            }
            if (s === expanded)
              return (
                <li class="rt-n cur">
                  <span class="rt-m" aria-hidden="true">
                    {i + 1}
                  </span>
                  <StopCard
                    m={m}
                    s={s}
                    st={st}
                    leg={leg}
                    ev={ev}
                    offer={offer}
                    title={title}
                    ready={ready}
                    avs={avs(true)}
                    driver={driver}
                    busy={busy}
                    times={times}
                    onStep={() => stepFwd(s)}
                    onEta={(min) => setEta(s, min)}
                    onPickKid={pickKid}
                    onContact={(kidId) => sheet.open(SHEET_CONTACT, { kid: kidId })}
                  />
                </li>
              );
            const sub = [s.venue ? (ev.address && ev.address !== ev.place ? shortAddr(ev.address) : legTime) : run ? shortAddr(s.fam?.address) : s.fam && fullAddress(s.fam)];
            if (st === 1) sub.push(he.drive.arrivedState);
            else if (ready) sub.push(he.drive.waiting);
            return (
              <li class="rt-n">
                <span class="rt-m" aria-hidden="true">
                  {i + 1}
                </span>
                <div class="rt-pend">
                  <button type="button" class="rt-row" onClick={() => setFocus(s.key)} aria-expanded="false">
                    {avs()}
                    <span class="grow1">
                      <b>{title}</b>
                      <small>{sub.filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                  {run && (
                    <button
                      type="button"
                      class="btn sm ghost"
                      onClick={() => stepFwd(s)}
                      disabled={busy}
                      aria-label={st === 0 ? he.drive.arriveLabel(title) : he.drive.pickLabel(title)}
                    >
                      {st === 0 ? he.drive.arrive : he.drive.pick}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {leg === "out" ? (
            <li class="rt-n end">
              <span class="rt-m" aria-hidden="true">
                <FlagIcon />
              </span>
              <div class="rt-pend">
                <div class="rt-t grow1">
                  <b>{ev.place}</b>
                  <small>
                    {ev.address && ev.address !== ev.place ? `${ev.address} · ` : ""}
                    <span class="num">{legTime}</span>
                  </small>
                </div>
                {run && !m.allIn && endBtn}
              </div>
            </li>
          ) : (
            m.homes.map((h, i) => {
              const last = i === m.homes.length - 1;
              const t = homeTarget(h);
              return (
                <li class={cx("rt-n rt-drop", last && "end", selHome === h && "sel")}>
                  <span class="rt-m" aria-hidden="true">
                    {last ? <FlagIcon /> : ""}
                  </span>
                  <div class="rt-pend">
                    <button
                      type="button"
                      class="rt-row"
                      onClick={() => setHome(h.fam.id)}
                      aria-pressed={selHome === h}
                      aria-label={he.drive.dropOff(t.label)}
                    >
                      <span class="grow1">
                        <b>{t.label}</b>
                        <small>{fullAddress(h.fam) || he.drive.noAddress}</small>
                      </span>
                    </button>
                    {last && run && !m.allIn && endBtn}
                  </div>
                </li>
              );
            })
          )}
        </ol>
      )}
      {!run && m.stops.length > 1 && <p class="small muted">{he.drive.orderHint}</p>}

      <div class="drv-bar">
        <div class="drv-bar-in">
          {!run ? (
            <button type="button" class="btn xl" onClick={start} disabled={busy || frozen || m.kidIds.length === 0}>
              {he.drive.start}
            </button>
          ) : (
            <div class="brow">
              {target?.addr ? <NavButton text={target.text} label={target.label} addr={target.addr} /> : <p class="drv-noaddr">{he.drive.noAddress}</p>}
              {m.allIn && (
                <button type="button" class="btn xl dark endb" onClick={() => end(true)} disabled={busy}>
                  {he.drive.end}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {sheets}
    </>
  );
}

/* ---------- the expanded stop ---------- */

function StopCard(p: {
  m: Model;
  s: Stop;
  st: Step;
  leg: Leg;
  ev: EventView;
  offer: Offer;
  title: string;
  ready: boolean;
  avs: JSX.Element;
  driver: string;
  busy: boolean;
  times: Map<string, number>;
  onStep: () => void;
  onEta: (minutes: number) => void;
  onPickKid: (kidId: string) => void;
  onContact: (kidId: string) => void;
}) {
  const { m, s, st, ev, offer } = p;
  const { idx } = m;
  const run = offer.run;
  const un = m.unpicked(s);
  const who = names(m, un);
  const eta = un.map((k) => run?.eta?.[k]).find(Boolean);
  const etaMin = eta ? Math.round((eta.at - eta.setAt) / 60_000) : null;
  const addr = s.venue ? (ev.address && ev.address !== ev.place ? ev.address : null) : s.fam && fullAddress(s.fam);
  const contactBtn = (kidId: string, sm?: boolean) => (
    <button
      type="button"
      class={cx("rnd", "wa", sm && "sm")}
      onClick={() => p.onContact(kidId)}
      aria-label={he.drive.contacts(s.venue ? idx.kidName(kidId) : p.title)}
      aria-haspopup="dialog"
    >
      <WaIcon size={22} />
    </button>
  );
  return (
    <div class="rt-card">
      <div class="row">
        {!s.venue && p.avs}
        <div class="grow1">
          <h3 class="rt-names">{p.title}</h3>
          <small class="muted">{s.venue ? <span class="num">{ev.returnTime}</span> : idx.famLabel(s.fam!.id)}</small>
        </div>
        {!s.venue && p.ready && <span class="tag ok">{he.drive.waiting}</span>}
      </div>
      {addr && (
        <p class="rt-addr">
          <PinIcon />
          <span>{addr}</span>
        </p>
      )}
      {s.venue && (
        <ul class="rt-kids">
          {s.kids.map((k) => {
            const kid = idx.kid(k)!;
            const picked = m.picked.has(k);
            return (
              <li>
                <Avatar name={kid.name} color={kid.family.color} />
                <span class="grow1">
                  <b>{kid.name}</b>
                  <small>
                    {idx.famLabel(kid.family.id)}
                    {!picked && offer.ready?.includes(k) ? ` · ${he.drive.waiting}` : ""}
                  </small>
                </span>
                {run && (st >= 1 || picked) && (
                  <button
                    type="button"
                    class={cx("btn sm", !picked && "ghost")}
                    aria-pressed={picked}
                    aria-label={he.drive.pickLabel(kid.name)}
                    onClick={() => p.onPickKid(k)}
                    disabled={p.busy}
                  >
                    {picked ? he.drive.inCar : he.drive.pick}
                  </button>
                )}
                {contactBtn(k, true)}
              </li>
            );
          })}
        </ul>
      )}
      {run && st === 0 && (
        <div class="chips2" role="group" aria-label={he.drive.etaLabel(who)}>
          <span class="lbl2">{he.drive.etaQ}</span>
          <div class="row">
            {ETA_CHIPS.map((min) => (
              <button type="button" class="chip" aria-pressed={etaMin === min} onClick={() => p.onEta(min)} disabled={p.busy}>
                {he.drive.etaChip(min)}
              </button>
            ))}
          </div>
          <p class={eta ? "kidsee" : "small muted"} data-testid="kid-sees">
            {eta ? he.drive.kidSees(who, he.drive.kidSeesEta(fmtClock(eta.at))) : he.drive.kidSeesNoEta(who)}
          </p>
        </div>
      )}
      {run && st === 1 && (
        <p class="kidsee" data-testid="kid-sees">
          {he.drive.kidSees(who, he.kid.status.arrived(p.driver))}
        </p>
      )}
      {(!s.venue || (run && st === 0)) && (
        <div class="row">
          {run && (!s.venue || st === 0) && (
            <button
              type="button"
              class={cx("btn big grow1", st === 0 && "dark")}
              onClick={p.onStep}
              disabled={p.busy}
              aria-label={st === 0 ? he.drive.arriveLabel(p.title) : he.drive.pickLabel(p.title)}
            >
              {st === 0 ? he.drive.arrive : he.drive.pick}
            </button>
          )}
          {!s.venue && contactBtn(s.kids[0]!)}
        </div>
      )}
    </div>
  );
}

/* ---------- sheets ---------- */

/** Whose contacts the sheet shows: the kid's whole stop on the way out, just the kid on the way back. */
function contactSet(m: Model, leg: Leg, kidId: string): string[] {
  if (leg === "back") return [kidId];
  return m.stops.find((s) => s.kids.includes(kidId))?.kids ?? [kidId];
}

function ContactBody({ m, leg, kidId }: { m: Model; leg: Leg; kidId: string }) {
  const { idx } = m;
  const set = contactSet(m, leg, kidId);
  const fam = idx.kid(kidId)!.family;
  const who = names(m, set);
  // The default contact is a kid with a phone, else a parent.
  const contacts = [
    ...set
      .map((k) => idx.kid(k)!)
      .filter((k) => k.phone)
      .map((k) => ({ name: k.name, phone: k.phone!, role: he.drive.kidPhone(k.name), text: he.wa.downstairs(k.name) })),
    ...fam.parents
      .filter((p) => p.phone)
      .map((p) => ({ name: p.name, phone: p.phone!, role: he.drive.parentOf(idx.famLabel(fam.id)), text: he.wa.downstairsParent(who) })),
  ];
  if (contacts.length === 0) return <p class="small muted">{he.drive.noContact}</p>;
  const [main, ...rest] = contacts as [(typeof contacts)[number], ...typeof contacts];
  const tel = (phone: string) => telHref(phone) ?? undefined;
  return (
    <div class="stack">
      <div class="ct-main">
        <div class="row sp">
          <span class="grow1">
            <b>{main.name}</b> <span class="tag ok">{he.drive.primary}</span>
            <small class="muted ct-role">{main.role}</small>
          </span>
          <a class="num phone" dir="ltr" href={tel(main.phone)}>
            {formatPhoneLocal(main.phone) ?? main.phone}
          </a>
        </div>
        <div class="row">
          <a class="btn ghost grow1" href={tel(main.phone)} aria-label={he.drive.callTo(main.name)}>
            <PhoneIcon />
            <span>{he.common.call}</span>
          </a>
          <WaButton class="btn wa grow1" phone={main.phone} text={main.text} label={he.drive.downstairsTo(main.name)}>
            {he.drive.downstairs}
          </WaButton>
        </div>
      </div>
      {rest.map((c) => (
        <div class="crow">
          <span class="grow1">
            <b>{c.name}</b>
            <small class="muted ct-role">{c.role}</small>
            <a class="num phone" dir="ltr" href={tel(c.phone)}>
              {formatPhoneLocal(c.phone) ?? c.phone}
            </a>
          </span>
          <a class="rnd sm" href={tel(c.phone)} aria-label={he.drive.callTo(c.name)}>
            <PhoneIcon />
          </a>
          <WaButton class="rnd sm wa" phone={c.phone} text={c.text} label={he.drive.downstairsTo(c.name)}>
            {""}
          </WaButton>
        </div>
      ))}
    </div>
  );
}

function DepartBody({
  group,
  ev,
  m,
  sent,
  onSent,
  onClose,
}: {
  group: string;
  ev: EventView;
  m: Model;
  sent: string[];
  onSent: (famId: string) => void;
  onClose: () => void;
}) {
  const { idx } = m;
  return (
    <>
      <p class="small muted">{he.drive.departHint}</p>
      <ul class="nrows">
        {m.others.map(({ fam, kids }) => {
          // One merged message per family: to a kid's phone if any, else to a parent with a phone.
          const kid = kids.map((k) => idx.kid(k)!).find((k) => k.phone);
          const parent = fam.parents.find((p) => p.phone);
          const to = kid ? { name: kid.name, phone: kid.phone!, parent: false, kidId: kid.id } : parent ? { name: parent.name, phone: parent.phone!, parent: true, kidId: kids[0]! } : null;
          const text = to ? he.wa.departed(kids.map(idx.kidName), appUrl(kidPath(group, idx.kid(to.kidId) ?? to.kidId, ev.id))) : "";
          const done = sent.includes(fam.id);
          return (
            <li class="nrow">
              <div class="nrow-h">
                <span class="avs">
                  {kids.map((k) => (
                    <Avatar name={idx.kidName(k)} color={fam.color} />
                  ))}
                </span>
                <span class="grow1">
                  <b>{idx.famLabel(fam.id)}</b>
                  <small class="muted">{to ? he.drive.departTo(to.name, to.parent) : names(m, kids)}</small>
                </span>
                {!to ? (
                  <small class="muted">{he.drive.noPhone}</small>
                ) : done ? (
                  <span class="sentok">{he.drive.sent}</span>
                ) : (
                  <WaButton class="btn wa sm" phone={to.phone} text={text} label={he.drive.sendLabel(to.name)} onClick={() => onSent(fam.id)}>
                    {he.drive.send}
                  </WaButton>
                )}
              </div>
              {to && <p class="bub">{text}</p>}
            </li>
          );
        })}
      </ul>
      {sent.length > 0 ? (
        <button type="button" class="btn big" onClick={onClose}>
          {he.drive.finish}
        </button>
      ) : (
        <button type="button" class="lnk center" onClick={onClose}>
          {he.drive.skip}
        </button>
      )}
    </>
  );
}

function NavAppBody({ onPick }: { onPick: () => void }) {
  const app = useNavApp();
  return (
    <div class="stack">
      {NAV_APPS.map((a) => (
        <button
          type="button"
          class="navopt"
          aria-pressed={a === app}
          onClick={() => {
            setNavApp(a);
            onPick();
          }}
        >
          <NavLogo app={a} />
          <b class="grow1">{NAV_APP_NAME[a]}</b>
          {a === app && (
            <span class="ck" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ))}
      <p class="small muted">{he.drive.navSaved}</p>
    </div>
  );
}

/* ---------- navigation button ---------- */

function NavButton({ text, label, addr }: { text: string; label: string; addr: string }) {
  const app = useNavApp();
  const sheet = useSheet();
  return (
    <div class="navb">
      <a class="navb-go" href={navUrl(app, addr)} target="_blank" rel="noopener noreferrer" aria-label={he.drive.navIn(label, NAV_APP_NAME[app])}>
        <NavLogo app={app} />
        <span>{text}</span>
      </a>
      <button type="button" class="navb-sel" aria-haspopup="dialog" aria-label={he.drive.navPick} onClick={() => sheet.open(SHEET_NAVAPP)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/* ---------- icons ---------- */

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" d="M12 21.5s7-6.6 7-11.8a7 7 0 10-14 0c0 5.2 7 11.8 7 11.8z" />
      <circle cx="12" cy="9.8" r="2.4" fill="currentColor" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 2h2v20H5zM8 3h11l-2.5 4L19 11H8z" />
    </svg>
  );
}
