import { familyDisplayName } from "../../shared/familyLabel.ts";
import { useEffect, useState } from "preact/hooks";
import type { KidEventView, KidLegStatus, KidRide, KidView, Leg } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { formatPhoneLocal, telHref } from "../../shared/phone.ts";
import { kidLegStatus, legOver } from "../../shared/view.ts";
import { CarPic, Plate } from "../components/CarCard.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { PhoneIcon } from "../components/WaButton.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { keys, refetch, useKid } from "../store.ts";
import { famColor, fmtClock, fmtDate, kidPath, nowLocal, todayYmd, useForce } from "../util.ts";

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
      <header class="kid-hdr" style={{ "--fc": famColor(v.kid.color) }}>
        <h1 class="display">{he.kid.hi(v.kid.name)}</h1>
        <p class="muted kid-grp">{v.group.name}</p>
      </header>
      {events.length === 0 && (
        <div class="legc wait">
          <b>{he.kid.noEvents}</b>
        </div>
      )}
      {events.map((e) => (
        <KidEvent group={group} token={token} focused={!!event} e={e} next={next} />
      ))}
      {event && (
        <a class="btn ghost" href={kidPath(group, token)}>
          {he.kid.allRides}
        </a>
      )}
    </>
  );
}

function KidEvent({ group, token, focused, e, next }: { group: string; token: string; focused: boolean; e: KidEventView; next: string | null }) {
  return (
    <section class={e.cancelled ? "stack is-cancelled" : "stack"} aria-label={e.title}>
      <div class="evh">
        {e.coverImageId && (
          <span class="cov">
            <img src={api.imageUrl(group, e.coverImageId)} alt="" />
          </span>
        )}
        <div class="evh-t">
          <b class="big-t">{e.title}</b>
          <small>
            {fmtDate(e.date)} · <time class="num">{e.start}</time> · {e.place}
          </small>
        </div>
      </div>
      {e.cancelled ? (
        <div class="legc dim" role="status">
          <b>{he.manage.kidCancelled}</b>
        </div>
      ) : focused && e.rsvp !== "yes" ? (
        <div class="legc dim">
          <span class="muted">{e.rsvp === "no" ? he.kid.notComing : he.kid.noRide}</span>
        </div>
      ) : (
        LEGS.map((leg) => (
          <KidLeg group={group} token={token} event={focused ? e.id : undefined} e={e} leg={leg} canReady={next === `${e.id}:${leg}`} />
        ))
      )}
    </section>
  );
}

/** First name of the driver's parent, for "X יצא/ה לדרך" / "X למטה!". */
const driverName = (r: KidRide) => r.driver.parents[0]?.name || he.family(familyDisplayName(r.driver));

/** The big, glanceable status line of a leg. */
function StatusBlock({ leg, status, ride }: { leg: Leg; status: KidLegStatus; ride: KidRide | null }) {
  let main: string;
  let hint: string | null = null;
  switch (status) {
    case "waiting":
      main = he.kid.status.waiting;
      break;
    case "assigned":
      main = he.kid.driver(familyDisplayName(ride!.driver));
      hint = he.kid.at(ride!.departAt);
      break;
    case "onTheWay": {
      const eta = ride!.eta;
      if (eta) {
        // Once the ETA has passed, "עוד רגע" instead of a time (the page re-renders every minute).
        main = Date.now() > eta.at ? he.kid.status.etaSoon : he.kid.status.eta(fmtClock(eta.at));
        hint = he.kid.status.etaUpdated(fmtClock(eta.setAt));
      } else {
        main = he.kid.status.onTheWay(driverName(ride!));
      }
      break;
    }
    case "arrived":
      main = he.kid.status.arrived(driverName(ride!));
      hint = he.kid.status.arrivedHint;
      break;
    case "picked":
      main = he.kid.status.picked;
      break;
    case "done":
      main = ride?.ended ? (leg === "out" ? he.kid.status.endedOut : he.kid.status.endedBack) : he.kid.status.done;
      break;
  }
  return (
    <div class={`kstat kstat-${status}`} role="status" aria-live="polite" aria-label={he.kid.statusLabel(leg)} data-status={status}>
      <b class="kstat-main">{main}</b>
      {hint && <span class={status === "assigned" ? "num big-time" : "kstat-hint"}>{hint}</span>}
    </div>
  );
}

function KidLeg({
  group,
  token,
  event,
  e,
  leg,
  canReady,
}: {
  group: string;
  token: string;
  event?: string;
  e: KidEventView;
  leg: Leg;
  canReady: boolean;
}) {
  const l = e.legs[leg];
  const [busy, setBusy] = useState(false);
  const status = kidLegStatus(l, legOver(e, leg, nowLocal()));
  if (!status)
    return (
      <div class="legc dim">
        <span class="k">{he.kid.pickup(leg)}</span>
        <span class="muted">{he.kid.notNeeded}</span>
      </div>
    );
  const r = l.ride;
  if (!r || status === "done")
    return (
      <div class={`legc ${r ? "dim" : "wait"}`}>
        <span class="k">{he.kid.pickup(leg)}</span>
        <StatusBlock leg={leg} status={status} ride={r} />
      </div>
    );
  const driver = r.driver.parents.find((p) => p.phone);
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
  return (
    <div class="legc" style={{ "--fc": famColor(r.driver.color) }}>
      <span class="k">{he.kid.pickup(leg)}</span>
      <StatusBlock leg={leg} status={status} ride={r} />
      {status !== "assigned" && (
        <span class="small">
          {he.kid.driver(familyDisplayName(r.driver))} · <span class="num">{he.kid.at(r.departAt)}</span>
        </span>
      )}
      <CarPic group={group} car={r.car} color={r.driver.color} big />
      <span class="small muted">{he.kid.findCar}</span>
      <span class="row">
        <b>
          {r.car.label}
          {r.car.color ? ` · ${r.car.color}` : ""}
        </b>
        <Plate plate={r.car.plate} />
      </span>
      {driver?.phone && (
        <div class="row sp">
          <a class="btn ghost" href={telHref(driver.phone) ?? undefined}>
            <PhoneIcon />
            <span>{he.kid.callDriver(driver.name)}</span>
          </a>
          <a class="num phone" dir="ltr" href={telHref(driver.phone) ?? undefined}>
            {formatPhoneLocal(driver.phone)}
          </a>
        </div>
      )}
      {!r.picked &&
        (canReady || r.ready) &&
        (r.ready ? (
          <p class="note ok">
            <b>{he.kid.readyDone}</b>
          </p>
        ) : (
          <button type="button" class="readybtn" onClick={ready} disabled={busy}>
            {he.kid.ready}
          </button>
        ))}
    </div>
  );
}
