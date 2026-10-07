import { Header } from "../components/Header.tsx";
import { he } from "../i18n/he.ts";
import { allIdentities } from "../identity.ts";
import { famColor } from "../util.ts";

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
              {groups.map(([gid, id]) => (
                <li>
                  <a class="evcard" href={`/g/${gid}`} style={{ "--fc": famColor(id.color) }}>
                    <span class="fdot lg" aria-hidden="true" />
                    <span class="evm">
                      <b>{id.groupName ?? gid}</b>
                      <small>{he.family(id.familyName)}</small>
                    </span>
                  </a>
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
