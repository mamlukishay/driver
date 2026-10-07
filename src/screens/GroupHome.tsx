import { MiniGap } from "../components/GapMeter.tsx";
import { Header, useIdentity, whoUrl } from "../components/Header.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useGroup } from "../store.ts";
import { appUrl, cx, dateBadge, fmtDate, todayYmd } from "../util.ts";
import type { EventSummary, Leg } from "../../shared/types.ts";

export function GroupHome({ group }: { group: string }) {
  const me = useIdentity(group);
  const res = useGroup(group);
  useLive(group);
  const data = res.data;

  const today = todayYmd();
  const key = (e: EventSummary) => e.date + e.start;
  // Upcoming soonest first; past (the server keeps only the last 30 days) newest first.
  const upcoming = (data?.events.filter((e) => e.date >= today) ?? []).sort((a, b) => key(a).localeCompare(key(b)));
  const past = (data?.events.filter((e) => e.date < today) ?? []).sort((a, b) => key(b).localeCompare(key(a)));
  const myKids = data?.me?.kids ?? [];

  return (
    <>
      <Header title={data?.group.name ?? he.common.loading} up="/" group={group} />
      <main id="main" class="content">
        {res.error && !data ? (
          <ErrorState code={res.error} onRetry={res.reload} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            {!me && (
              <div class="note">
                <p>{he.group.viewOnlyNote}</p>
              </div>
            )}
            {me ? (
              <a class="btn big" href={`/g/${group}/new`}>
                {he.group.newEvent}
              </a>
            ) : (
              <a class="btn big" href={whoUrl(group, location.pathname + location.search)}>
                {he.group.joinCta}
              </a>
            )}
            <h2 class="hs">{he.group.upcoming}</h2>
            {upcoming.length === 0 && <p class="note">{he.group.empty}</p>}
            <ul class="list">
              {upcoming.map((e) => (
                <li>
                  <EventCard group={group} e={e} myKids={myKids} />
                </li>
              ))}
            </ul>
            {past.length > 0 && (
              <details class="past">
                <summary class="hs">
                  {he.group.past} <span class="muted small num">({past.length})</span>
                </summary>
                <ul class="list">
                  {past.map((e) => (
                    <li>
                      <EventCard group={group} e={e} myKids={myKids} dim />
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <nav class="links" aria-label={he.group.myFamily}>
              {me && <a href={`/g/${group}/me`}>{he.group.myFamily}</a>}
              <a href={`/g/${group}/settings`}>{he.group.settings}</a>
              <WaButton class="lnk-wa" text={he.wa.groupInvite(data.group.name, appUrl(`/join/${group}`))}>
                {he.group.invite}
              </WaButton>
            </nav>
            <p class="small muted center">{he.group.familiesCount(data.families.length)}</p>
          </>
        )}
      </main>
    </>
  );
}

/** ✓ seated · ? needs a ride · – not needed / not coming. */
function legMark(e: EventSummary, kidId: string, leg: Leg): string {
  const p = e.kidPlans[kidId];
  if (!p || p.rsvp !== "yes" || !p[leg]) return "–";
  return e.seated[leg].includes(kidId) ? "✓" : "?";
}

function EventCard({ group, e, myKids, dim }: { group: string; e: EventSummary; myKids: readonly { id: string; name: string }[]; dim?: boolean }) {
  const b = dateBadge(e.date);
  const answered = myKids.filter((k) => e.kidPlans[k.id]);
  return (
    <a class={cx("evcard", dim && "dim", e.cancelled && "is-cancelled")} href={`/g/${group}/e/${e.id}`}>
      <span class="evd" aria-hidden="true">
        <b>{b.day}</b>
        {b.month}
      </span>
      <span class="evm grow1">
        <span class="row">
          <b>{e.title}</b>
          {e.cancelled && <span class="tag off">{he.manage.cancelledTag}</span>}
        </span>
        <small>
          {fmtDate(e.date)} · <time class="num">{e.start}</time> · {e.place}
        </small>
        {!e.cancelled && (
          <span class="gms">
            <MiniGap gap={e.gaps.out} leg="out" />
            <MiniGap gap={e.gaps.back} leg="back" />
          </span>
        )}
        {!e.cancelled && answered.length > 0 && (
          <span class="kidchips">
            {answered.map((k) => (
              <span class="kchip">{he.manage.myKid(k.name, legMark(e, k.id, "out"), legMark(e, k.id, "back"))}</span>
            ))}
          </span>
        )}
      </span>
    </a>
  );
}
