import type { EventView, Leg, PublicAction } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { toast } from "../components/Toast.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { keys, refetch, setData } from "../store.ts";
import { appUrl, eventIndex, fmtDate, legTime } from "../util.ts";

/** Runs an action with optimistic-concurrency, updates the cache and shows the undo toast (or, with `undo: false`, a plain one unless the text is empty). */
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
    // Without undo, an empty text means no toast at all (driver mode: the screen itself shows the change).
    if (opts.undo === false) {
      if (toastText) toast.info(toastText);
    }
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

/**
 * Runs several actions in a row (siblings at one stop), each against the version the previous one
 * returned. No toast on success; on failure the event is refetched and the error shown.
 */
export async function runActions(group: string, ev: EventView, actions: PublicAction[]): Promise<boolean> {
  let version = ev.version;
  let last: EventView | null = null;
  try {
    for (const action of actions) {
      const r = await api.act(group, ev.id, action, version);
      last = r.event;
      version = r.event.version;
    }
    if (last) setData<EventView>(keys.event(group, ev.id), last);
    return true;
  } catch (e) {
    if (last) setData<EventView>(keys.event(group, ev.id), last);
    if (e instanceof ApiError && e.code === "stale") await refetch(keys.event(group, ev.id));
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
        driver: idx.driver(o)?.name,
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

const BANNER_MS = 48 * 60 * 60 * 1000;

/**
 * The latest date/time change (from the newest editEvent log entry that changed one, within 48h and
 * not undone), as Hebrew lines for the "עודכן" banner. Null when there is none.
 */
export function latestTimeChange(ev: EventView, now = Date.now()): { logId: string; lines: string[] } | null {
  for (let i = ev.log.length - 1; i >= 0; i--) {
    const l = ev.log[i]!;
    if (now - l.at > BANNER_MS) return null;
    const a = l.action;
    if (a.type !== "editEvent" || l.undoneBy || !a.prev) continue;
    const lines: string[] = [];
    if (a.prev.date && a.patch.date) lines.push(he.manage.dateChanged(fmtDate(a.prev.date), fmtDate(a.patch.date)));
    if (a.prev.start && a.patch.start) lines.push(he.manage.timeChanged(a.prev.start, a.patch.start));
    if (a.prev.returnTime && a.patch.returnTime) lines.push(he.manage.returnChanged(a.prev.returnTime, a.patch.returnTime));
    if (lines.length) return { logId: l.id, lines };
  }
  return null;
}

/** Link to the family profile with a kid's phone field focused ("+ הוספת טלפון ל{kid}"). */
export const kidPhonePath = (group: string, kidId: string) => `/g/${group}/me?focus=kid-${kidId}-phone`;

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
    case "updateOffer": {
      // A driver change reads "החליפו נהג/ת: דני → רותי"; no prevDriverId: an older offer, driven by the first person.
      const fam = idx.fam(entry.familyId);
      const to = a.driverId ? fam?.parents.find((p) => p.id === a.driverId) : undefined;
      const from = a.driverId ? idx.driver({ familyId: entry.familyId, ...(a.prevDriverId ? { driverId: a.prevDriverId } : {}) }) : undefined;
      text = to && from ? L.driverChanged(from.name, to.name) : L.updateOffer;
      break;
    }
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
    case "setEta":
      text = L.setEta(a.kidIds.map(idx.kidName).join(", "), a.minutes);
      break;
    case "endRun":
      text = L.endRun(a.ended);
      break;
    case "editEvent": {
      const changes = Object.keys(a.prev ?? {}).map((k) => {
        const from = a.prev?.[k as keyof typeof a.prev];
        const to = a.patch[k as keyof typeof a.patch];
        const name = he.manage.field[k] ?? k;
        const show = (v: unknown) => (k === "date" && typeof v === "string" ? fmtDate(v) : String(v ?? ""));
        return k === "start" || k === "returnTime" || k === "date" ? he.manage.fieldChange(name, show(from), show(to)) : name;
      });
      text = changes.length ? L.editEventChanges(changes) : L.editEvent;
      break;
    }
    case "cancelEvent":
      text = L.cancelEvent;
      break;
    case "restoreEvent":
      text = L.restoreEvent;
      break;
    case "confirmDeparture":
      text = L.confirmDeparture;
      break;
    case "undo":
      text = L.undo;
      break;
    default:
      text = L.other;
  }
  return L.line(idx.famLabel(entry.familyId), text);
}
