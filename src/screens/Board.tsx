import { useEffect, useRef, useState } from "preact/hooks";
import type { EventView, Leg, Offer } from "../../shared/types.ts";
import { CarCard } from "../components/CarCard.tsx";
import { Stepper } from "../components/Field.tsx";
import { GapMeter } from "../components/GapMeter.tsx";
import { Header } from "../components/Header.tsx";
import { KidChip } from "../components/KidChip.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useSheet } from "../nav.ts";
import { useEvent } from "../store.ts";
import { addMinutes, cx, eventIndex } from "../util.ts";
import { askText, runAction } from "./eventCommon.tsx";
import { EventFrame } from "./EventFrame.tsx";

export function Board({ group, event, leg }: { group: string; event: string; leg: Leg }) {
  const res = useEvent(group, event);
  useLive(group);
  const ev = res.data;
  return (
    <>
      <Header title={ev ? `${ev.title} · ${he.legName[leg]}` : he.common.loading} up={`/g/${group}/e/${event}`} group={group} groupLine />
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
  // A cancelled event freezes the board: nothing can be seated or offered.
  const frozen = !!ev.cancelled;

  // Seating and unseating act on tap (no confirmation; the toast offers undo).
  // A ref, not state, so a second tap in the same frame is already ignored.
  const busy = useRef(false);
  const seat = async (o: Offer, kidId: string) => {
    if (busy.current) return;
    busy.current = true;
    const name = idx.kidName(kidId);
    const ok = await runAction(
      group,
      ev,
      { type: "seatKid", offerId: o.id, kidId },
      o.familyId === me ? he.toast.took(name) : he.toast.seated(name, idx.famLabel(o.familyId)),
    );
    busy.current = false;
    if (ok) setSel(null);
  };
  const unseat = async (o: Offer, kidId: string) => {
    if (busy.current) return;
    busy.current = true;
    await runAction(group, ev, { type: "unseatKid", offerId: o.id, kidId }, he.toast.unseated(idx.kidName(kidId)));
    busy.current = false;
  };

  const onChip = (kidId: string) => {
    if (frozen) return toast.warn(he.errors.event_cancelled);
    if (!me) return toast.warn(he.board.whyViewOnly);
    if (!kidMine(kidId) && !myOffer) return toast.warn(he.board.whyNotMyKid(idx.kidName(kidId)));
    setSel(sel === kidId ? null : kidId);
  };

  const onEmpty = (o: Offer) => {
    if (frozen) return toast.warn(he.errors.event_cancelled);
    if (!me) return toast.warn(he.board.whyViewOnly);
    if (!sel) return toast.warn(waiting.length ? he.board.whyPickFirst : he.board.whyNoWaiting);
    if (!kidMine(sel) && o.familyId !== me) return toast.warn(he.board.whySeatNotAllowed(idx.kidName(sel), idx.famLabel(o.familyId)));
    void seat(o, sel);
  };

  const onSeated = (o: Offer, kidId: string) => {
    if (frozen) return toast.warn(he.errors.event_cancelled);
    if (!me) return toast.warn(he.board.whyViewOnly);
    if (!kidMine(kidId) && o.familyId !== me) return toast.warn(he.board.whyUnseat(idx.kidName(kidId)));
    void unseat(o, kidId);
  };

  const confirmDepart = (o: Offer) => runAction(group, ev, { type: "confirmDeparture", offerId: o.id }, he.manage.toastConfirmed);

  return (
    <EventFrame group={group} ev={ev} tab={leg}>

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
                if (!(myOffer && myFree > 0) || frozen) return chip;
                return (
                  <div class="row sp take-row">
                    {chip}
                    <button type="button" class="mini" onClick={() => void seat(myOffer, kidId)}>
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
              departCheck={!!o.departAtCheck}
              onConfirmDepart={mine && !frozen ? () => confirmDepart(o) : undefined}
              kids={o.kidIds.map((id) => {
                const k = idx.kid(id);
                return { id, name: k?.name ?? "?", color: k?.family.color ?? 0, ready: o.ready?.includes(id) };
              })}
              onEmptySeat={() => onEmpty(o)}
              onKid={(kidId) => onSeated(o, kidId)}
              driveHref={mine && !frozen ? `/g/${group}/e/${ev.id}/drive/${leg}` : undefined}
              onEdit={mine && !frozen ? () => sheet.open("car", { offer: o.id }) : undefined}
            />
          );
        })}
        {me && !frozen && !myOffer && myFam && myFam.cars.length > 0 && (
          <button type="button" class="btn ghost big" onClick={() => sheet.open("car")}>
            {he.board.offer(leg)}
          </button>
        )}
        {me && !frozen && !myOffer && myFam && myFam.cars.length === 0 && (
          <p class="note small">
            {he.board.noCarInProfile} <a href={`/g/${group}/me`}>{he.board.toProfile}</a>
          </p>
        )}
      </section>

      <CarSheet group={group} ev={ev} leg={leg} />
    </EventFrame>
  );
}

function useOfferFromQuery(ev: EventView, leg: Leg, id: string | undefined) {
  return id ? ev.offers[leg].find((o) => o.id === id) : undefined;
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
