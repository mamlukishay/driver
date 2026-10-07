import { MiniGap } from "../components/GapMeter.tsx";
import { Header, useIdentity, whoUrl } from "../components/Header.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { he } from "../i18n/he.ts";
import { useLive } from "../live.ts";
import { useGroup } from "../store.ts";
import { appUrl, dateBadge, fmtDate, todayYmd } from "../util.ts";

export function GroupHome({ group }: { group: string }) {
  const me = useIdentity(group);
  const res = useGroup(group);
  useLive(group);
  const data = res.data;

  const today = todayYmd();
  const upcoming = data?.events.filter((e) => e.date >= today) ?? [];
  const past = data?.events.filter((e) => e.date < today) ?? [];

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
                  <EventCard group={group} e={e} />
                </li>
              ))}
            </ul>
            {past.length > 0 && (
              <>
                <h2 class="hs">{he.group.past}</h2>
                <ul class="list">
                  {past.map((e) => (
                    <li>
                      <EventCard group={group} e={e} dim />
                    </li>
                  ))}
                </ul>
              </>
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

function EventCard({ group, e, dim }: { group: string; e: import("../../shared/types.ts").EventSummary; dim?: boolean }) {
  const b = dateBadge(e.date);
  return (
    <a class={`evcard ${dim ? "dim" : ""}`} href={`/g/${group}/e/${e.id}`}>
      <span class="evd" aria-hidden="true">
        <b>{b.day}</b>
        {b.month}
      </span>
      <span class="evm grow1">
        <b>{e.title}</b>
        <small>
          {fmtDate(e.date)} · <time class="num">{e.start}</time> · {e.place}
        </small>
        <span class="gms">
          <MiniGap gap={e.gaps.out} leg="out" />
          <MiniGap gap={e.gaps.back} leg="back" />
        </span>
      </span>
    </a>
  );
}
