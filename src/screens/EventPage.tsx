import { useState } from "preact/hooks";
import type { EventView, KidPlan } from "../../shared/types.ts";
import { LEGS } from "../../shared/types.ts";
import { Switch } from "../components/Field.tsx";
import { Header, whoUrl } from "../components/Header.tsx";
import { Avatar } from "../components/KidChip.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useEvent } from "../store.ts";
import { appUrl, eventIndex, fmtDate, kidPath } from "../util.ts";
import { kidPhonePath, runAction } from "./eventCommon.tsx";
import { EventFrame, EventHistory } from "./EventFrame.tsx";

export function EventPage({ group, event }: { group: string; event: string }) {
  const res = useEvent(group, event);
  useLive(group);
  const ev = res.data;
  return (
    <>
      <Header title={ev?.title ?? he.common.loading} up={`/g/${group}`} group={group} groupLine />
      <main id="main" class="content">
        {res.error && !ev ? <ErrorState code={res.error} onRetry={res.reload} /> : !ev ? <Loading /> : <EventBody group={group} ev={ev} />}
      </main>
    </>
  );
}

function EventBody({ group, ev }: { group: string; ev: EventView }) {
  const mine = ev.families.find((f) => f.id === ev.me);
  return (
    <EventFrame group={group} ev={ev} tab="details">
      <section class="card" aria-labelledby="rsvp-h">
        <h2 class="hs" id="rsvp-h">
          {he.event.myKids}
        </h2>
        {!ev.me ? (
          <>
            <p class="small muted">{he.event.joinToRsvp}</p>
            <a class="btn" href={whoUrl(group, location.pathname + location.search)}>
              {he.group.joinCta}
            </a>
          </>
        ) : !mine || mine.kids.length === 0 ? (
          <p class="small muted">{he.event.noKids}</p>
        ) : (
          mine.kids.map((k) => <KidRsvp group={group} ev={ev} kid={k} color={mine.color} plan={ev.kidPlans[k.id]} />)
        )}
      </section>

      <EventHistory ev={ev} />
    </EventFrame>
  );
}

function KidRsvp({
  group,
  ev,
  kid,
  color,
  plan,
}: {
  group: string;
  ev: EventView;
  kid: { id: string; name: string; phone?: string };
  color: number;
  plan: KidPlan | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const frozen = !!ev.cancelled;
  const coming = plan?.rsvp === "yes";
  const save = async (next: KidPlan) => {
    setBusy(true);
    await runAction(group, ev, { type: "setKidPlan", kidId: kid.id, ...next }, he.toast.planSaved(kid.name));
    setBusy(false);
  };
  return (
    <div class="rsvp">
      <div class="row">
        <Avatar name={kid.name} color={color} />
        <b>{kid.name}</b>
        <small class="muted">· {!plan ? he.event.notAnswered : coming ? "" : he.event.notComing}</small>
      </div>
      <Switch
        label={he.event.coming}
        checked={coming}
        disabled={busy || frozen}
        onChange={(v) => save(v ? { rsvp: "yes", out: true, back: true } : { rsvp: "no", out: false, back: false })}
      />
      <Switch label={he.event.out} checked={coming && !!plan?.out} disabled={busy || frozen || !coming} onChange={(v) => save({ rsvp: "yes", out: v, back: !!plan?.back })} />
      <Switch label={he.event.back} checked={coming && !!plan?.back} disabled={busy || frozen || !coming} onChange={(v) => save({ rsvp: "yes", out: !!plan?.out, back: v })} />
      {coming &&
        !frozen &&
        // KISS: only offer sending when the kid has a phone; otherwise a shortcut to add one.
        (kid.phone ? (
          <WaButton class="btn wa sm" phone={kid.phone} text={kidEventText(group, ev, kid)} label={he.event.sendToKidLabel(kid.name)}>
            {he.event.sendToKid(kid.name)}
          </WaButton>
        ) : (
          <a class="lnk start" href={kidPhonePath(group, kid.id)}>
            {he.manage.noPhone(kid.name)}
          </a>
        ))}
    </div>
  );
}

/** WhatsApp text for a kid: the event, one line per leg they need, and their per-event live link. */
function kidEventText(group: string, ev: EventView, kid: { id: string; name: string }): string {
  const idx = eventIndex(ev);
  const plan = ev.kidPlans[kid.id];
  const legs = LEGS.filter((leg) => plan?.[leg]).map((leg) => {
    const o = ev.offers[leg].find((x) => x.kidIds.includes(kid.id));
    const driver = o && idx.driver(o)?.name;
    return he.wa.legLine(leg, o ? { family: idx.famLabel(o.familyId), departAt: o.departAt, ...(driver ? { driver } : {}) } : null);
  });
  return he.wa.kidEvent({ kid: kid.name, title: ev.title, date: fmtDate(ev.date), legs, url: appUrl(kidPath(group, kid.id, ev.id)) });
}
