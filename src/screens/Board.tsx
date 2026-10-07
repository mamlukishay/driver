import { useEffect, useState } from "preact/hooks";
import type { EventView, Leg, Offer } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { CarCard } from "../components/CarCard.tsx";
import { Stepper } from "../components/Field.tsx";
import { GapMeter } from "../components/GapMeter.tsx";
import { Header } from "../components/Header.tsx";
import { KidChip } from "../components/KidChip.tsx";
import { ConfirmSentence, Sheet } from "../components/Sheet.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useSheet } from "../nav.ts";
import { useEvent } from "../store.ts";
import { addMinutes, cx, eventIndex, famColor, fmtClock, legTime } from "../util.ts";
import { askText, EventHead, logLine, runAction } from "./eventCommon.tsx";

export function Board({ group, event, leg }: { group: string; event: string; leg: Leg }) {
  const res = useEvent(group, event);
  useLive(group);
  const ev = res.data;
  return (
    <>
      <Header title={ev ? `${ev.title} · ${he.legName[leg]}` : he.common.loading} up={`/g/${group}/e/${event}`} group={group} />
      <main id="main" class="content">
        {res.error && !ev ? (
          <ErrorState code={res.error} onRetry={res.reload} />
        ) : !ev ? (
          <Loading />
        ) : (
          <BoardBody group={group} ev={ev} leg={leg} />
        )}
      </main>
    </>
  );
}

function BoardBody({ group, ev, leg }: { group: string; ev: EventView; leg: Leg }) {
  const idx = eventIndex(ev);
  const sheet = useSheet();
  const [sel, setSel] = useState<string | null>(null);
  const me = ev.me;
  const offers = ev.offers[leg];
  const myOffer = offers.find((o) => o.familyId === me);
  const myFam = me ? idx.fam(me) : undefined;
  const waiting = ev.waiting[leg];
  const myFree = myOffer ? myOffer.seats - myOffer.kidIds.length : 0;

  // Drop a selection that is no longer waiting (seated by someone else, plan changed).
  useEffect(() => {
    if (sel && !waiting.includes(sel)) setSel(null);
  }, [ev.version, leg]);

  const kidMine = (kidId: string) => !!me && idx.kid(kidId)?.family.id === me;

  const onChip = (kidId: string) => {
    if (!me) return toast.warn(he.board.whyViewOnly);
    if (!kidMine(kidId) && !myOffer) return toast.warn(he.board.whyNotMyKid(idx.kidName(kidId)));
    setSel(sel === kidId ? null : kidId);
  };

  const onEmpty = (o: Offer) => {
    if (!me) return toast.warn(he.board.whyViewOnly);
    if (!sel) return toast.warn(waiting.length ? he.board.whyPickFirst : he.board.whyNoWaiting);
    if (!kidMine(sel) && o.familyId !== me) return toast.warn(he.board.whySeatNotAllowed(idx.kidName(sel), idx.famLabel(o.familyId)));
    sheet.open("seat", { kid: sel, offer: o.id });
  };

  const onSeated = (o: Offer, kidId: string) => {
    if (!me) return toast.warn(he.board.whyViewOnly);
    if (!kidMine(kidId) && o.familyId !== me) return toast.warn(he.board.whyUnseat(idx.kidName(kidId)));
    sheet.open("unseat", { kid: kidId, offer: o.id });
  };

  const log = [...ev.log].reverse().slice(0, 8);

  return (
    <>
      <EventHead group={group} ev={ev} />
      <nav class="tabs" aria-label={he.board.tabs}>
        {LEGS.map((l) => (
          <a href={`/g/${group}/e/${ev.id}/${l}`} aria-current={l === leg ? "page" : undefined}>
            {he.legName[l]} · <time class="num">{legTime(ev, l)}</time>
          </a>
        ))}
      </nav>

      <GapMeter gap={ev.gaps[leg]} leg={leg} askText={askText(group, ev, leg)} />

      <section class="card" aria-labelledby="wait-h">
        <h2 class="hs" id="wait-h">
          {he.board.waiting(leg)}
        </h2>
        {waiting.length === 0 ? (
          <p class="small muted">{he.board.noneWaiting}</p>
        ) : (
          <>
            <div class={cx("chips", myFree > 0 && "rows")}>
              {waiting.map((kidId) => {
                const k = idx.kid(kidId);
                const chip = <KidChip name={k?.name ?? "?"} color={k?.family.color ?? 0} selected={sel === kidId} onClick={() => onChip(kidId)} />;
                if (!(myOffer && myFree > 0)) return chip;
                return (
                  <div class="row sp take-row">
                    {chip}
                    <button type="button" class="mini" onClick={() => sheet.open("seat", { kid: kidId, offer: myOffer.id })}>
                      {he.board.take}
                    </button>
                  </div>
                );
              })}
            </div>
            <p class="small muted" aria-live="polite">
              {sel ? he.board.seatHint(idx.kidName(sel)) : me ? he.board.pickHint : he.board.whyViewOnly}
            </p>
          </>
        )}
      </section>

      <section class="stack" aria-labelledby="cars-h">
        <h2 class="hs" id="cars-h">
          {he.board.cars}
        </h2>
        {offers.length === 0 && <p class="small muted">{he.board.noCars}</p>}
        {offers.map((o) => {
          const fam = idx.fam(o.familyId);
          const mine = o.familyId === me;
          return (
            <CarCard
              group={group}
              offer={o}
              car={idx.car(o.familyId, o.carId)}
              familyLabel={idx.famLabel(o.familyId)}
              color={fam?.color ?? 0}
              mine={mine}
              armed={!!sel && (mine || kidMine(sel))}
              kids={o.kidIds.map((id) => {
                const k = idx.kid(id);
                return { id, name: k?.name ?? "?", color: k?.family.color ?? 0, ready: o.ready?.includes(id) };
              })}
              onEmptySeat={() => onEmpty(o)}
              onKid={(kidId) => onSeated(o, kidId)}
              actions={
                mine ? (
                  <>
                    <button type="button" class="mini" onClick={() => sheet.open("car", { offer: o.id })}>
                      {he.common.edit}
                    </button>
                    <a class="mini" href={`/g/${group}/e/${ev.id}/drive/${leg}`}>
                      {he.event.driveMode}
                    </a>
                  </>
                ) : undefined
              }
            />
          );
        })}
        {me && !myOffer && myFam && myFam.cars.length > 0 && (
          <button type="button" class="btn ghost big" onClick={() => sheet.open("car")}>
            {he.board.offer(leg)}
          </button>
        )}
        {me && !myOffer && myFam && myFam.cars.length === 0 && (
          <p class="note small">
            {he.board.noCarInProfile} <a href={`/g/${group}/me`}>{he.board.toProfile}</a>
          </p>
        )}
      </section>

      <section class="card" aria-labelledby="log-h">
        <h2 class="hs" id="log-h">
          {he.board.history}
        </h2>
        {log.length === 0 ? (
          <p class="small muted">{he.board.noHistory}</p>
        ) : (
          <ul class="logl">
            {log.map((l) => (
              <li class={l.undoneBy ? "undone" : ""}>
                <time class="t num">{fmtClock(l.at)}</time>
                <span class="fdot" style={{ "--fc": famColor(idx.fam(l.familyId)?.color ?? 0) }} aria-hidden="true" />
                <span>
                  {logLine(ev, l)} {l.undoneBy && <small>{he.log.undone}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SeatSheet group={group} ev={ev} leg={leg} onDone={() => setSel(null)} />
      <UnseatSheet group={group} ev={ev} leg={leg} />
      <CarSheet group={group} ev={ev} leg={leg} />
    </>
  );
}

function useOfferFromQuery(ev: EventView, leg: Leg, id: string | undefined) {
  return id ? ev.offers[leg].find((o) => o.id === id) : undefined;
}

function SeatSheet({ group, ev, leg, onDone }: { group: string; ev: EventView; leg: Leg; onDone: () => void }) {
  const sheet = useSheet();
  const [busy, setBusy] = useState(false);
  const open = sheet.name === "seat";
  const idx = eventIndex(ev);
  const offer = useOfferFromQuery(ev, leg, sheet.query.offer);
  const kid = sheet.query.kid ? idx.kid(sheet.query.kid) : undefined;
  const valid = open && offer && kid;
  const mine = offer?.familyId === ev.me;
  const famName = offer ? idx.famLabel(offer.familyId) : "";
  const confirm = async () => {
    if (!offer || !kid) return;
    setBusy(true);
    const ok = await runAction(
      group,
      ev,
      { type: "seatKid", offerId: offer.id, kidId: kid.id },
      mine ? he.toast.took(kid.name) : he.toast.seated(kid.name, famName),
    );
    setBusy(false);
    if (ok) onDone();
    sheet.close();
  };
  return (
    <Sheet open={!!valid} title={he.seatSheet.title} onClose={sheet.close}>
      {valid && (
        <ConfirmSentence
          parts={
            mine
              ? he.seatSheet.partsMine(kid.name, leg, offer.departAt)
              : he.seatSheet.parts(kid.name, famName, leg, offer.departAt)
          }
          note={mine ? undefined : he.seatSheet.notice}
          confirm={mine ? he.seatSheet.confirmTake : he.seatSheet.confirm}
          onConfirm={confirm}
          onCancel={sheet.close}
          busy={busy}
        />
      )}
    </Sheet>
  );
}

function UnseatSheet({ group, ev, leg }: { group: string; ev: EventView; leg: Leg }) {
  const sheet = useSheet();
  const [busy, setBusy] = useState(false);
  const idx = eventIndex(ev);
  const offer = useOfferFromQuery(ev, leg, sheet.query.offer);
  const kid = sheet.query.kid ? idx.kid(sheet.query.kid) : undefined;
  const valid = sheet.name === "unseat" && offer && kid && offer.kidIds.includes(kid.id);
  const confirm = async () => {
    if (!offer || !kid) return;
    setBusy(true);
    await runAction(group, ev, { type: "unseatKid", offerId: offer.id, kidId: kid.id }, he.toast.unseated(kid.name));
    setBusy(false);
    sheet.close();
  };
  return (
    <Sheet open={!!valid} title={he.unseatSheet.title} onClose={sheet.close}>
      {valid && (
        <ConfirmSentence
          parts={[he.unseatSheet.sentence(kid.name, idx.famLabel(offer.familyId), leg)]}
          confirm={he.unseatSheet.confirm}
          onConfirm={confirm}
          onCancel={sheet.close}
          busy={busy}
          danger
        />
      )}
    </Sheet>
  );
}

function CarSheet({ group, ev, leg }: { group: string; ev: EventView; leg: Leg }) {
  const sheet = useSheet();
  const idx = eventIndex(ev);
  const open = sheet.name === "car" && !!ev.me;
  const editing = useOfferFromQuery(ev, leg, sheet.query.offer);
  const cars = (ev.me && idx.fam(ev.me)?.cars) || [];
  const [carId, setCarId] = useState("");
  const [seats, setSeats] = useState(4);
  const [depart, setDepart] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmRemove(false);
    if (editing) {
      setCarId(editing.carId);
      setSeats(editing.seats);
      setDepart(editing.departAt);
    } else {
      const c = cars[0];
      setCarId(c?.id ?? "");
      setSeats(c?.seats ?? 4);
      setDepart(leg === "out" ? addMinutes(ev.start, -30) : ev.returnTime);
    }
  }, [open, editing?.id]);

  const car = cars.find((c) => c.id === carId);
  const maxSeats = car?.seats ?? 8;
  const minSeats = Math.max(1, editing?.kidIds.length ?? 1);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!car || !/^\d{2}:\d{2}$/.test(depart)) return;
    setBusy(true);
    const ok = editing
      ? await runAction(group, ev, { type: "updateOffer", offerId: editing.id, seats, departAt: depart }, he.toast.offerUpdated)
      : await runAction(group, ev, { type: "offerCar", leg, carId: car.id, seats, departAt: depart }, he.toast.offered(leg));
    setBusy(false);
    if (ok) sheet.close();
  };
  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    const ok = await runAction(group, ev, { type: "removeOffer", offerId: editing.id }, he.toast.offerRemoved);
    setBusy(false);
    if (ok) sheet.close();
  };

  return (
    <Sheet open={open} title={editing ? he.carSheet.titleEdit : he.carSheet.titleNew(leg)} onClose={sheet.close}>
      <form class="stack-form" onSubmit={submit}>
        {!editing && cars.length > 1 && (
          <fieldset class="pills">
            <legend class="small muted">{he.carSheet.car}</legend>
            {cars.map((c) => (
              <button
                type="button"
                class="pill"
                aria-pressed={c.id === carId}
                onClick={() => {
                  setCarId(c.id);
                  setSeats(c.seats);
                }}
              >
                {c.label}
              </button>
            ))}
          </fieldset>
        )}
        {(editing || cars.length === 1) && car && (
          <p class="row">
            <span class="muted small">{he.carSheet.car}:</span> <b>{car.label}</b>
          </p>
        )}
        <Stepper
          id="offer-seats"
          label={he.carSheet.seats}
          hint={editing && editing.kidIds.length > 1 ? he.carSheet.seatsMin(editing.kidIds.length) : undefined}
          value={seats}
          min={minSeats}
          max={maxSeats}
          onChange={setSeats}
        />
        <div class="fld">
          <label for="offer-depart">{he.carSheet.depart}</label>
          <input id="offer-depart" type="time" value={depart} required onInput={(e) => setDepart((e.currentTarget as HTMLInputElement).value)} />
        </div>
        <button type="submit" class="btn big" disabled={busy || !car} data-autofocus>
          {busy ? he.common.saving : editing ? he.carSheet.save : he.carSheet.submit}
        </button>
        {editing &&
          (confirmRemove ? (
            <div class="conf">
              <span>{he.carSheet.removeConfirm}</span>
              <div class="row">
                <button type="button" class="btn danger grow1" onClick={remove} disabled={busy}>
                  {he.carSheet.removeYes}
                </button>
                <button type="button" class="btn ghost" onClick={() => setConfirmRemove(false)}>
                  {he.common.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" class="lnk bad start" onClick={() => setConfirmRemove(true)}>
              {he.carSheet.remove}
            </button>
          ))}
      </form>
    </Sheet>
  );
}
