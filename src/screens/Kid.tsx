import { useState } from "preact/hooks";
import type { KidEventView, KidView, Leg } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { formatPhoneLocal, telHref } from "../../shared/phone.ts";
import { CarPic, Plate } from "../components/CarCard.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { PhoneIcon } from "../components/WaButton.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { keys, refetch, useKid } from "../store.ts";
import { famColor, fmtDate, todayYmd } from "../util.ts";

export function Kid({ group, token }: { group: string; token: string }) {
  const res = useKid(group, token);
  useLive(group);
  const v = res.data;
  return (
    <main id="main" class="content kidpage">
      {res.error && !v ? (
        <ErrorState code={res.error} onRetry={res.reload} />
      ) : !v ? (
        <Loading />
      ) : (
        <KidBody group={group} token={token} v={v} />
      )}
    </main>
  );
}

function KidBody({ group, token, v }: { group: string; token: string; v: KidView }) {
  const today = todayYmd();
  const events = v.events.filter((e) => e.date >= today && e.rsvp === "yes");
  // The server marks "ready" on the earliest upcoming ride, so only that one gets the button.
  let next: string | null = null;
  for (const e of events) {
    for (const leg of LEGS) {
      const r = e.legs[leg].ride;
      if (!next && r && !r.picked) next = `${e.id}:${leg}`;
    }
  }
  return (
    <>
      <header class="kid-hdr" style={{ "--fc": famColor(v.kid.color) }}>
        <h1 class="display">{he.kid.hi(v.kid.name)}</h1>
        <p class="muted">{he.kid.lead}</p>
      </header>
      {events.length === 0 && (
        <>
          <div class="legc wait">
            <b>{he.kid.noEvents}</b>
          </div>
          <p class="note">{he.kid.tip}</p>
        </>
      )}
      {events.map((e) => (
        <KidEvent group={group} token={token} e={e} next={next} />
      ))}
    </>
  );
}

function KidEvent({ group, token, e, next }: { group: string; token: string; e: KidEventView; next: string | null }) {
  return (
    <section class="stack" aria-label={e.title}>
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
      {LEGS.map((leg) => (
        <KidLeg group={group} token={token} e={e} leg={leg} canReady={next === `${e.id}:${leg}`} />
      ))}
    </section>
  );
}

function KidLeg({ group, token, e, leg, canReady }: { group: string; token: string; e: KidEventView; leg: Leg; canReady: boolean }) {
  const l = e.legs[leg];
  const [busy, setBusy] = useState(false);
  if (!l.needed)
    return (
      <div class="legc dim">
        <span class="k">{he.kid.pickup(leg)}</span>
        <span class="muted">{he.kid.notNeeded}</span>
      </div>
    );
  const r = l.ride;
  if (!r)
    return (
      <div class="legc wait">
        <span class="k">{he.kid.pickup(leg)}</span>
        <b class="gapc">{he.kid.searching}</b>
        <span class="small muted">{he.kid.searchingHint}</span>
      </div>
    );
  const driver = r.driver.parents.find((p) => p.phone);
  const ready = async () => {
    setBusy(true);
    try {
      await api.kidReady(group, token, true);
      await refetch(keys.kid(group, token));
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
      <b class="big-t">{he.kid.driver(r.driver.name)}</b>
      <span class="num big-time">{he.kid.at(r.departAt)}</span>
      {r.started && !r.picked && <span class="live">{he.kid.onTheWay}</span>}
      {r.picked && <span class="note ok">{he.kid.pickedUp}</span>}
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
