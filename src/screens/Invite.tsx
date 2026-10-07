import { Header } from "../components/Header.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { useEvent } from "../store.ts";

export function Invite({ group, event }: { group: string; event: string }) {
  const res = useEvent(group, event);
  const ev = res.data;
  return (
    <>
      <Header title={ev ? `${he.invite.title} · ${ev.title}` : he.invite.title} up={`/g/${group}/e/${event}`} group={group} noChip groupLine />
      <main id="main" class="content">
        {res.error && !ev ? (
          <ErrorState code={res.error} onRetry={res.reload} />
        ) : !ev ? (
          <Loading />
        ) : ev.coverImageId ? (
          <div class="inv-full">
            <img src={api.imageUrl(group, ev.coverImageId)} alt={`${he.invite.title}: ${ev.title}`} />
          </div>
        ) : (
          <p class="note">{he.invite.none}</p>
        )}
      </main>
    </>
  );
}
