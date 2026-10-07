import type { EventView, Leg, PublicAction } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { toast } from "../components/Toast.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { keys, refetch, setData } from "../store.ts";
import { appUrl, eventIndex, fmtDate, legTime } from "../util.ts";

/** Runs an action with optimistic-concurrency, updates the cache and shows the undo toast. */
export async function runAction(
  group: string,
  ev: EventView,
  action: PublicAction,
  toastText: string,
  opts: { undo?: boolean } = {},
): Promise<boolean> {
  try {
    const r = await api.act(group, ev.id, action, ev.version);
    setData<EventView>(keys.event(group, ev.id), r.event);
    if (opts.undo === false) toast.info(toastText);
    else toast.undoable(toastText, { group, event: ev.id, logId: r.logId });
    return true;
  } catch (e) {
    if (e instanceof ApiError && (e.code === "stale" || e.code === "seat_taken" || e.code === "car_full")) {
      await refetch(keys.event(group, ev.id));
    }
    toast.error(e);
    return false;
  }
}

export function EventHead({ group, ev }: { group: string; ev: EventView }) {
  return (
    <div class="evh">
      {ev.coverImageId ? (
        <a class="cov" href={`/g/${group}/e/${ev.id}/invite`} aria-label={he.event.inviteFull}>
          <img src={api.imageUrl(group, ev.coverImageId)} alt="" />
        </a>
      ) : (
        <span class="cov ph" aria-hidden="true">
          🎈
        </span>
      )}
      <div class="evh-t">
        <b>{ev.title}</b>
        <small>
          {fmtDate(ev.date)} · <time class="num">{ev.start}</time> · {ev.place}
        </small>
        <small>
          <span class="num">{he.event.returnAt(ev.returnTime)}</span>
        </small>
      </div>
    </div>
  );
}

export function summaryText(group: string, ev: EventView): string {
  const idx = eventIndex(ev);
  return he.wa.summary({
    title: ev.title,
    date: fmtDate(ev.date),
    place: ev.place,
    legs: LEGS.map((leg) => ({
      leg,
      time: legTime(ev, leg),
      missing: ev.gaps[leg].missing,
      cars: ev.offers[leg].map((o) => ({
        family: idx.famLabel(o.familyId),
        departAt: o.departAt,
        kids: o.kidIds.map(idx.kidName),
      })),
    })),
    url: appUrl(`/g/${group}/e/${ev.id}`),
  });
}

export function askText(group: string, ev: EventView, leg: Leg): string {
  return he.wa.ask(ev.title, fmtDate(ev.date), ev.gaps[leg].missing, leg, appUrl(`/g/${group}/e/${ev.id}/${leg}`));
}

/** Human sentence for a log entry. */
export function logLine(ev: EventView, entry: EventView["log"][number]): string {
  const idx = eventIndex(ev);
  const a = entry.action;
  const L = he.log;
  let text: string;
  switch (a.type) {
    case "setKidPlan":
      text = L.setKidPlan(idx.kidName(a.kidId), a.rsvp, a.out, a.back);
      break;
    case "offerCar":
      text = L.offerCar(a.leg, a.seats);
      break;
    case "updateOffer":
      text = L.updateOffer;
      break;
    case "removeOffer":
      text = L.removeOffer;
      break;
    case "seatKid": {
      const o = [...ev.offers.out, ...ev.offers.back].find((x) => x.id === a.offerId);
      text = L.seatKid(idx.kidName(a.kidId), o ? idx.famLabel(o.familyId) : "?");
      break;
    }
    case "unseatKid":
      text = L.unseatKid(idx.kidName(a.kidId));
      break;
    case "startRun":
      text = L.startRun;
      break;
    case "setPicked":
      text = L.setPicked(idx.kidName(a.kidId), a.picked);
      break;
    case "setKidReady":
      text = L.setKidReady(idx.kidName(a.kidId));
      break;
    case "setArrived":
      text = L.setArrived(idx.kidName(a.kidId), a.arrived);
      break;
    case "editEvent":
      text = L.editEvent;
      break;
    case "undo":
      text = L.undo;
      break;
    default:
      text = L.other;
  }
  return L.line(idx.famLabel(entry.familyId), text);
}
