import { familyDisplayName } from "../../shared/familyLabel.ts";
import { useEffect, useState } from "preact/hooks";
import type { KidEventView, KidLegStatus, KidRide, KidView, Leg } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { formatPhoneLocal, telHref } from "../../shared/phone.ts";
import { kidLegStatus, legOver } from "../../shared/view.ts";
import { CarSide, PlateIL } from "../components/CarCard.tsx";
import { CheckIcon } from "../components/icons.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { PhoneIcon } from "../components/WaButton.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { keys, refetch, useKid } from "../store.ts";
import { cx, fmtDate, kidPath, nowLocal, todayYmd, useForce } from "../util.ts";

/**
 * The read-only kid page. Without `event`: the next upcoming rides (permanent link). With `event`:
 * that one event, both legs. Live: refetched on every group update (live.ts).
 */
export function Kid({ group, kidId: token, event }: { group: string; kidId: string; event?: string }) {
  const res = useKid(group, token, event);
  useLive(group);
  // Statuses depend on the clock ("done"), so re-render once a minute.
  const force = useForce();
  useEffect(() => {
    const t = setInterval(force, 60_000);
    return () => clearInterval(t);
  }, []);
  const v = res.data;
  return (
    <main id="main" class="content kidpage">
      {res.error && !v ? (
        <ErrorState code={res.error} onRetry={res.reload} />
      ) : !v ? (
        <Loading />
      ) : (
        <KidBody group={group} token={token} event={event} v={v} />
      )}
    </main>
  );
}

function KidBody({ group, token, event, v }: { group: string; token: string; event?: string; v: KidView }) {
  const today = todayYmd();
  const events = event ? v.events : v.events.filter((e) => e.date >= today && e.rsvp === "yes");
  // The server marks "ready" on the earliest unpicked ride (within the event on a per-event page),
  // so only that one gets the button.
  let next: string | null = null;
  for (const e of events) {
    if (e.cancelled) continue;
    for (const leg of LEGS) {
      const r = e.legs[leg].ride;
      if (!next && r && !r.picked) next = `${e.id}:${leg}`;
    }
  }
  return (
    <>
      <header class="kid-hdr">
        <h1 class="display">{he.kid.hi(v.kid.name)}</h1>
        <p class="kid-grp">{v.group.name}</p>
      </header>
      {events.length === 0 && <p class="kline">{he.kid.noEvents}</p>}
      {events.map((e) => (
        <KidEvent group={group} token={token} focused={!!event} e={e} next={next} familyId={v.kid.familyId} />
      ))}
      {event && (
        <a class="btn ghost kid-all" href={kidPath(group, token)}>
          {he.kid.allRides}
        </a>
      )}
    </>
  );
}

function KidEvent({
  group,
  token,
  focused,
  e,
  next,
  familyId,
}: {
  group: string;
  token: string;
  focused: boolean;
  e: KidEventView;
  next: string | null;
  familyId: string;
}) {
  return (
    <section class={cx("kid-ev", e.cancelled && "is-cancelled")} aria-label={e.title}>
      <div class="evh">
        {e.coverImageId && (
          <span class="cov">
            <img src={api.imageUrl(group, e.coverImageId)} alt="" />
          </span>
        )}
        <div class="evh-t">
          <b>{e.title}</b>
          <small>
            {fmtDate(e.date)} · <time class="num">{e.start}</time> · {e.place}
          </small>
        </div>
      </div>
      {e.cancelled ? (
        <p class="kline" role="status">
          <b>{he.manage.kidCancelled}</b>
        </p>
      ) : focused && e.rsvp !== "yes" ? (
        <p class="kline">{e.rsvp === "no" ? he.kid.notComing : he.kid.noRide}</p>
      ) : (
        LEGS.map((leg) => (
          <KidLeg
            group={group}
            token={token}
            event={focused ? e.id : undefined}
            e={e}
            leg={leg}
            canReady={next === `${e.id}:${leg}`}
            familyId={familyId}
          />
        ))
      )}
    </section>
  );
}

/** First name of the driver's parent, for "X יצא/ה לדרך" / "X למטה!". */
const driverName = (r: KidRide) => r.driver.parents[0]?.name || he.family(familyDisplayName(r.driver));

/** What a ticket says for a status: the road sign, the huge line (arrived), the hint, the stamp. */
export interface TicketCopy {
  sign: string | null;
  hint: string | null;
  big?: string;
  stamp?: string;
}

/** The one place that maps a leg status to its words. */
export function ticketCopy(status: KidLegStatus, ride: KidRide | null): TicketCopy {
  switch (status) {
    case "waiting":
      return { sign: he.kid.status.waiting, hint: he.kid.status.waitingHint };
    case "assigned":
      return { sign: he.kid.status.assigned, hint: null };
    case "onTheWay":
      return { sign: he.kid.status.onTheWaySign, hint: ride ? he.kid.status.onTheWay(driverName(ride)) : null };
    case "next":
      return { sign: he.kid.status.next, hint: he.kid.status.nextHint };
    case "arrived":
      return { sign: null, big: ride ? he.kid.status.arrived(driverName(ride)) : "", hint: he.kid.status.arrivedHint };
    case "picked":
      return { sign: he.kid.status.picked, hint: null, stamp: he.kid.status.pickedStamp };
    case "done":
      return { sign: null, hint: null, stamp: he.kid.status.doneStamp };
  }
}

function KidLeg({
  group,
  token,
  event,
  e,
  leg,
  canReady,
  familyId,
}: {
  group: string;
  token: string;
  event?: string;
  e: KidEventView;
  leg: Leg;
  canReady: boolean;
  familyId: string;
}) {
  const l = e.legs[leg];
  const [busy, setBusy] = useState(false);
  const status = kidLegStatus(l, legOver(e, leg, nowLocal()));
  const label = he.kid.legLabel(leg);
  if (!status)
    return (
      <p class="kline">
        {label} · {he.kid.notNeeded}
      </p>
    );
  const r = l.ride;
  const statusAttrs = { role: "status", "aria-live": "polite", "aria-label": he.kid.statusLabel(leg), "data-status": status } as const;
  if (!r && status === "done")
    return (
      <p class="kline" {...statusAttrs}>
        {label} · {he.kid.status.done}
      </p>
    );
  const copy = ticketCopy(status, r);
  const home = he.kid.home;
  if (!r)
    return (
      <article class="tk wait">
        <div class="tk-main" {...statusAttrs}>
          <div class="tk-top">
            <span class="tk-leg">{label}</span>
            <span class="sign out">{copy.sign}</span>
          </div>
          <div class="tk-route">
            <div>
              <small>{he.kid.from}</small>
              <b class="tk-to">{leg === "out" ? home : e.place}</b>
            </div>
            <div />
            <div class="tk-dest">
              <small>{he.kid.to}</small>
              <b class="tk-to">{leg === "out" ? e.place : home}</b>
            </div>
          </div>
          {copy.hint && <p class="tk-hint">{copy.hint}</p>}
        </div>
      </article>
    );

  // The kid rides in their own family's car: no calling, no "find the car", no "ready".
  const own = r.driver.familyId === familyId;
  const arr = status === "arrived" && !own;
  const caller = own || status === "picked" || status === "done" ? undefined : r.driver.parents.find((p) => p.phone);
  const ready = async () => {
    setBusy(true);
    try {
      await api.kidReady(group, token, true, event);
      await refetch(keys.kid(group, token, event));
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_found") toast.warn(he.kid.noRide);
      else toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  const showReady = !own && status !== "done" && !r.picked && (r.ready || (canReady && status !== "arrived"));
  return (
    <div class="kleg">
      <article class={cx("tk", arr && "arr", status === "picked" && "pk", status === "done" && "done")}>
        <div class="tk-main" {...statusAttrs}>
          {arr ? (
            <>
              <span class="tk-leg">
                {label} · <time class="num">{r.departAt}</time>
              </span>
              <b class="tk-big">{copy.big}</b>
              <p class="tk-go">{copy.hint}</p>
            </>
          ) : (
            <>
              <div class="tk-top">
                <span class="tk-leg">{label}</span>
                {copy.sign && <span class="sign">{copy.sign}</span>}
              </div>
              <div class="tk-route">
                <div>
                  <small>{he.kid.departs}</small>
                  <time class="tk-time num">{r.departAt}</time>
                </div>
                <div class="tk-path" aria-hidden="true">
                  <CarSide color={r.car.color} width={34} />
                </div>
                <div class="tk-dest">
                  <small>{he.kid.to}</small>
                  <b class="tk-to">{leg === "out" ? e.place : home}</b>
                </div>
              </div>
              <p class="tk-who">{own ? he.kid.withFamily : <Who family={familyDisplayName(r.driver)} />}</p>
              {copy.hint && <p class="tk-hint">{copy.hint}</p>}
              {copy.stamp && (
                <span class="stamp">
                  {status === "picked" && <CheckIcon size={22} />}
                  {copy.stamp}
                </span>
              )}
            </>
          )}
        </div>
        <div class="tk-perf" aria-hidden="true" />
        <div class="tk-stub">
          {arr && <b class="tk-find">{he.kid.findCar}</b>}
          <TicketCar group={group} r={r} />
          {caller?.phone && (
            <a class="kcall" href={telHref(caller.phone) ?? undefined} aria-label={he.kid.callLabel(caller.name)}>
              <span class="ic">
                <PhoneIcon />
              </span>
              <b>{caller.name}</b>
              <span class="num" dir="ltr">
                {formatPhoneLocal(caller.phone)}
              </span>
            </a>
          )}
        </div>
      </article>
      {showReady &&
        (r.ready ? (
          <p class="ksent">
            <CheckIcon size={16} />
            {he.kid.readyDone}
          </p>
        ) : (
          <button type="button" class="readybtn" onClick={ready} disabled={busy}>
            {he.kid.ready}
          </button>
        ))}
    </div>
  );
}

function Who({ family }: { family: string }) {
  const [pre, name, post] = he.kid.driverParts(family);
  return (
    <>
      {pre}
      <b>{name.b}</b>
      {post}
    </>
  );
}

/** The ticket stub's car: the photo when there is one, else the car drawn in its color; model, color, seats, plate. */
function TicketCar({ group, r }: { group: string; r: KidRide }) {
  const c = r.car;
  const meta = (
    <div class="meta">
      <b>{c.label}</b>
      <small>{he.kid.carMeta(c.color, c.seats)}</small>
      {!c.photoId && <PlateIL plate={c.plate} />}
    </div>
  );
  return c.photoId ? (
    <>
      <img class="tk-photo" src={api.imageUrl(group, c.photoId)} alt={c.label} loading="lazy" />
      <div class="tk-car">
        {meta}
        <PlateIL plate={c.plate} />
      </div>
    </>
  ) : (
    <div class="tk-car">
      <CarSide color={c.color} />
      {meta}
    </div>
  );
}
