import { useEffect, useRef, useState } from "preact/hooks";
import type { EventView, FamilyView, Leg, Offer } from "../../shared/types.ts";
import { formatPhoneLocal, telHref } from "../../shared/phone.ts";
import { pickupStops } from "../../shared/view.ts";
import { Header } from "../components/Header.tsx";
import { Avatar } from "../components/KidChip.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { PhoneIcon, WaButton } from "../components/WaButton.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useEvent } from "../store.ts";
import { appUrl, cx, eventIndex, kidPath } from "../util.ts";
import { DepartCheck } from "../components/CarCard.tsx";
import { EventHead, kidPhonePath, runAction } from "./eventCommon.tsx";

export function Drive({ group, event, leg }: { group: string; event: string; leg: Leg }) {
  const res = useEvent(group, event);
  useLive(group);
  const ev = res.data;
  const valid = leg === "out" || leg === "back";
  return (
    <>
      <Header title={he.drive.title(valid ? leg : "out")} up={`/g/${group}/e/${event}`} group={group} groupLine />
      <main id="main" class="content">
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

const MAPS_MAX_WAYPOINTS = 8;

function mapsUrl(stops: string[], destination: string): string {
  const p = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (stops.length) p.set("waypoints", stops.slice(0, MAPS_MAX_WAYPOINTS).join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
const wazeUrl = (addr: string) => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;

function DriveBody({ group, ev, leg }: { group: string; ev: EventView; leg: Leg }) {
  const idx = eventIndex(ev);
  const offer = ev.offers[leg].find((o) => o.familyId === ev.me);
  const [busy, setBusy] = useState(false);
  const [justStarted, setJustStarted] = useState(false);
  const shareRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (justStarted) shareRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [justStarted]);

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

  // The pickup order (shared with the kid page's "you're next"): out = one stop per family in seating order.
  const order = pickupStops(leg, offer.kidIds, (k) => idx.kid(k)?.family.id).flat();
  // Families in the car, in seating order.
  const fams: { fam: FamilyView; kids: string[] }[] = [];
  for (const kidId of offer.kidIds) {
    const k = idx.kid(kidId);
    if (!k) continue;
    const g = fams.find((x) => x.fam.id === k.family.id);
    if (g) g.kids.push(kidId);
    else fams.push({ fam: k.family, kids: [kidId] });
  }
  const picked = new Set(offer.run?.picked ?? []);
  const addrs = fams.map((f) => f.fam.address).filter((a): a is string => !!a);
  const venue = ev.address || ev.place;

  // Out: pick up at homes, then the venue. Back: everyone boards at the venue, then homes.
  let maps: string | null = null;
  let next: string | null = null;
  if (leg === "out") {
    if (venue) maps = mapsUrl(addrs, venue);
    const nextFam = fams.find((f) => f.kids.some((k) => !picked.has(k)));
    next = nextFam?.fam.address ?? venue ?? null;
  } else if (addrs.length) {
    maps = mapsUrl(addrs.slice(0, -1), addrs[addrs.length - 1]!);
    next = offer.kidIds.every((k) => picked.has(k)) || !venue ? addrs[0]! : venue;
  }

  const start = async () => {
    setBusy(true);
    const ok = await runAction(group, ev, { type: "startRun", offerId: offer.id }, he.toast.started);
    setBusy(false);
    if (ok) setJustStarted(true);
  };

  const frozen = !!ev.cancelled;
  const confirmDepart = () => runAction(group, ev, { type: "confirmDeparture", offerId: offer.id }, he.manage.toastConfirmed);

  return (
    <>
      <EventHead group={group} ev={ev} />
      {frozen && (
        <p class="note cancel-note" role="status">
          <b>{he.manage.cancelled}</b>
          <span class="small">{he.manage.cancelledNote}</span>
        </p>
      )}
      {offer.departAtCheck && !frozen && <DepartCheck onConfirm={confirmDepart} />}
      {offer.run ? (
        <span class="live">{he.drive.onTheWay}</span>
      ) : (
        <button type="button" class="btn big" onClick={start} disabled={busy || frozen || offer.kidIds.length === 0}>
          {he.drive.start}
        </button>
      )}

      {offer.run && fams.length > 0 && (
        <section class="card" aria-labelledby="notify-h">
          <h2 class="hs" id="notify-h">
            {he.drive.notifyTitle}
          </h2>
          {fams.map(({ fam, kids }) => {
            const parent = fam.parents.find((p) => p.phone);
            return (
              <div class="row sp">
                <span>{idx.famLabel(fam.id)}</span>
                {parent?.phone ? (
                  <WaButton class="btn wa sm" phone={parent.phone} text={he.wa.leftHome(kids.map(idx.kidName))}>
                    {parent.name}
                  </WaButton>
                ) : (
                  <small class="muted">{he.drive.notifyNoPhone}</small>
                )}
              </div>
            );
          })}
        </section>
      )}

      {offer.kidIds.length > 0 && (
        <section ref={shareRef} class={cx("card", justStarted && "hl")} aria-labelledby="share-h">
          <h2 class="hs" id="share-h">
            {he.drive.shareTitle}
          </h2>
          <p class="small muted">{he.drive.shareHint}</p>
          {order.map((kidId) => {
            const k = idx.kid(kidId);
            if (!k) return null;
            // KISS: send only to the kid's own phone. No phone: my kid gets an "add a phone" shortcut.
            return (
              <div class="row sp">
                <b>{k.name}</b>
                {k.phone ? (
                  <WaButton class="btn wa sm" phone={k.phone} text={he.wa.trackRide(appUrl(kidPath(group, k, ev.id)))}>
                    {he.drive.shareTo(k.name)}
                  </WaButton>
                ) : k.family.id === ev.me ? (
                  <a class="lnk" href={kidPhonePath(group, kidId)}>
                    {he.manage.noPhone(k.name)}
                  </a>
                ) : (
                  <small class="muted">{he.manage.noPhoneOther(k.name)}</small>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section class="stack" aria-labelledby="check-h">
        <h2 class="hs" id="check-h">
          {he.drive.checklist}
        </h2>
        {offer.kidIds.length === 0 && <p class="small muted">{he.drive.noKids}</p>}
        {offer.kidIds.length > 0 && offer.kidIds.every((k) => picked.has(k)) && (
          <p class="note ok">
            <b>{he.drive.allIn(offer.kidIds.length)}</b>
          </p>
        )}
        {order.map((kidId) => (
          <KidStop group={group} ev={ev} offer={offer} kidId={kidId} picked={picked.has(kidId)} />
        ))}
      </section>

      <section class="card" aria-labelledby="nav-h">
        <h2 class="hs" id="nav-h">
          {he.drive.nav}
        </h2>
        {!maps && !next ? (
          <p class="small muted">{he.drive.noAddress}</p>
        ) : (
          <div class="navs">
            {maps && (
              <a class="btn ghost" href={maps} target="_blank" rel="noopener noreferrer">
                <b>{he.drive.maps}</b>
                <span class="small muted">{he.drive.mapsSub}</span>
              </a>
            )}
            {next && (
              <a class="btn ghost" href={wazeUrl(next)} target="_blank" rel="noopener noreferrer">
                <b>{he.drive.waze}</b>
                <span class="small muted">{he.drive.wazeSub}</span>
              </a>
            )}
          </div>
        )}
        {addrs.length > MAPS_MAX_WAYPOINTS && <p class="small muted">{he.drive.tooMany}</p>}
      </section>
    </>
  );
}

function KidStop({ group, ev, offer, kidId, picked }: { group: string; ev: EventView; offer: Offer; kidId: string; picked: boolean }) {
  const idx = eventIndex(ev);
  const k = idx.kid(kidId);
  const [busy, setBusy] = useState(false);
  if (!k) return null;
  const parent = k.family.parents.find((p) => p.phone);
  const ready = offer.ready?.includes(kidId);
  const arrived = !!offer.run?.arrived?.includes(kidId);
  const arrive = async () => {
    if (!offer.run) return;
    setBusy(true);
    await runAction(
      group,
      ev,
      { type: "setArrived", offerId: offer.id, kidId, arrived: !arrived },
      arrived ? he.toast.unarrived(k.name) : he.toast.arrived(k.name),
      { undo: false },
    );
    setBusy(false);
  };
  const toggle = async () => {
    if (!offer.run) return;
    setBusy(true);
    await runAction(
      group,
      ev,
      { type: "setPicked", offerId: offer.id, kidId, picked: !picked },
      picked ? he.toast.unpicked(k.name) : he.toast.picked(k.name),
      { undo: false },
    );
    setBusy(false);
  };
  // Default contact is the kid when their phone is visible, else the parent.
  const primary = k.phone ? { phone: k.phone, name: k.name, kid: true } : parent?.phone ? { phone: parent.phone, name: parent.name, kid: false } : null;
  return (
    <div class="stopc">
      <button type="button" class="chk" role="checkbox" aria-checked={picked} onClick={toggle} disabled={busy || !offer.run}>
        <span class="bx" aria-hidden="true">
          {picked ? "✓" : ""}
        </span>
        <Avatar name={k.name} color={k.family.color} />
        <span class="grow1">
          <b>{k.name}</b>
          <small>
            {idx.famLabel(k.family.id)}
            {k.family.address ? ` · ${k.family.address}` : ""}
          </small>
        </span>
        {ready && <span class="tag ok">{he.drive.ready}</span>}
      </button>
      {offer.run && !picked && (
        <div class="stop-acts">
          <button
            type="button"
            class={cx("btn sm grow1", arrived ? "on" : "ghost")}
            aria-pressed={arrived}
            aria-label={he.drive.arrivedLabel(k.name)}
            onClick={arrive}
            disabled={busy}
          >
            {arrived ? he.drive.arrivedOn : he.drive.arrived}
          </button>
          <button type="button" class="btn sm grow1" onClick={toggle} disabled={busy}>
            {he.drive.pickedBtn}
          </button>
        </div>
      )}
      {primary && (
        <div class="ctc">
          <div class="row sp">
            <span class="small muted">{primary.kid ? he.drive.kidPhone : he.drive.parentPhone(primary.name)}</span>
            <a class="num phone" dir="ltr" href={telHref(primary.phone) ?? undefined}>
              {formatPhoneLocal(primary.phone) ?? primary.phone}
            </a>
          </div>
          <div class="row wrap">
            <a class="btn sm" href={telHref(primary.phone) ?? undefined} aria-label={primary.kid ? he.drive.callKid(k.name) : he.drive.callParent(primary.name)}>
              <PhoneIcon />
              <span>{he.common.call}</span>
            </a>
            <WaButton class="btn wa sm" phone={primary.phone} text={primary.kid ? he.wa.downstairs(k.name) : he.wa.downstairsParent(k.name)}>
              {primary.kid ? he.drive.waKid(k.name) : he.drive.waParent(primary.name)}
            </WaButton>
            {primary.kid && parent?.phone && (
              <WaButton class="mini" phone={parent.phone} text={he.wa.downstairsParent(k.name)}>
                {he.drive.waParent(parent.name)}
              </WaButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
