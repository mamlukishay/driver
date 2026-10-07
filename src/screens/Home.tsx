import { Header } from "../components/Header.tsx";
import { he } from "../i18n/he.ts";
import { allIdentities } from "../identity.ts";
import { useGroup } from "../store.ts";
import { famColor, famLabel } from "../util.ts";

/** One "my groups" row: names come from the group itself (only the family id is stored). */
function GroupRow({ group, familyId }: { group: string; familyId: string }) {
  const res = useGroup(group);
  const families = res.data?.families ?? [];
  const fam = families.find((f) => f.id === familyId);
  return (
    <a class="evcard" href={`/g/${group}`} style={{ "--fc": famColor(fam?.color ?? 0) }}>
      <span class="fdot lg" aria-hidden="true" />
      <span class="evm">
        <b>{res.data?.group.name ?? group}</b>
        <small>{fam ? famLabel(fam, families) : "…"}</small>
      </span>
    </a>
  );
}

export function Home() {
  const groups = Object.entries(allIdentities());
  return (
    <>
      <Header title={he.appName} />
      <main id="main" class="content">
        {groups.length === 0 ? (
          <section class="hero-empty">
            <div class="lane" aria-hidden="true" />
            <h2 class="display">{he.home.emptyTitle}</h2>
            <p class="muted">{he.home.emptyBody}</p>
            <a class="btn big" href="/new-group">
              {he.home.create}
            </a>
            <p class="small muted">{he.home.emptyHint}</p>
          </section>
        ) : (
          <>
            <h2 class="hs">{he.home.title}</h2>
            <ul class="list">
              {groups.map(([gid, familyId]) => (
                <li>
                  <GroupRow group={gid} familyId={familyId} />
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
