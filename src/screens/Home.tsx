import { nextEventDate } from "../../shared/myGroups.ts";
import { Header } from "../components/Header.tsx";
import { he } from "../i18n/he.ts";
import { allIdentities, myGroupsByLastUsed } from "../identity.ts";
import { useGroup } from "../store.ts";
import { famColor, famLabel, fmtDate, todayYmd } from "../util.ts";

/** One "my groups" row: the group name, my kids there and the next event (only the family id is stored). */
function GroupRow({ group, familyId }: { group: string; familyId: string }) {
  const res = useGroup(group);
  const families = res.data?.families ?? [];
  const fam = families.find((f) => f.id === familyId);
  const next = res.data ? nextEventDate(res.data.events, todayYmd()) : null;
  const kids = fam?.kids.map((k) => k.name) ?? [];
  return (
    <a class="evcard" href={`/g/${group}`} style={{ "--fc": famColor(fam?.color ?? 0) }}>
      <span class="fdot lg" aria-hidden="true" />
      <span class="evm">
        <b>{res.data?.group.name ?? group}</b>
        <small class="grp-kids">{fam ? (kids.length ? he.joinNames(kids) : famLabel(fam, families)) : "…"}</small>
        {next && <small class="grp-next">{he.home.nextEvent(fmtDate(next))}</small>}
      </span>
    </a>
  );
}

export function Home() {
  const ids = allIdentities();
  const groups = myGroupsByLastUsed();
  return (
    <>
      <Header title={he.appName} />
      <main id="main" class="content">
        {groups.length === 0 ? (
          <section class="hero-empty">
            <div class="lane" aria-hidden="true" />
            <a class="btn big" href="/new-group">
              {he.home.create}
            </a>
            <p class="small muted">{he.home.emptyHint}</p>
          </section>
        ) : (
          <>
            <h2 class="hs">{he.home.title}</h2>
            <ul class="list">
              {groups.map((gid) => (
                <li key={gid}>
                  <GroupRow group={gid} familyId={ids[gid]!} />
                </li>
              ))}
            </ul>
            <a class="btn ghost big" href="/new-group">
              {he.home.create}
            </a>
          </>
        )}
      </main>
    </>
  );
}
