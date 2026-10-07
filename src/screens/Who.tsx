/** "מי אתם?": pick which family this phone acts as in the group (or register, or just look). */
import { useLocation } from "preact-iso";
import type { FamilyPublic } from "../../shared/types.ts";
import { Header } from "../components/Header.tsx";
import { ConfirmSentence, Sheet } from "../components/Sheet.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { he } from "../i18n/he.ts";
import { setBrowsing, setIdentity } from "../identity.ts";
import { useLeave, useReplaceLink, useSheet, withQuery } from "../nav.ts";
import { useGroup } from "../store.ts";
import { famColor, famLabel } from "../util.ts";

/** A safe in-app return path for `?next=`; defaults to the group home. */
export function safeNext(group: string, next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith(`/g/${group}/who`)) return next;
  return `/g/${group}`;
}

/** Families ordered by registration, as shown on the picker. */
export const byCreation = (fams: readonly FamilyPublic[]) => [...fams].sort((a, b) => a.createdAt - b.createdAt);

export function Who({ group }: { group: string }) {
  const { query } = useLocation();
  const leave = useLeave();
  const replaceLink = useReplaceLink();
  const next = safeNext(group, query.next);
  const res = useGroup(group);
  const sheet = useSheet();
  const families = res.data?.families ?? [];
  const picked = sheet.name === "confirm" ? families.find((f) => f.id === sheet.query.fam) : undefined;

  const choose = (f: FamilyPublic) => {
    setIdentity(group, f.id);
    setBrowsing(group, false);
    leave(next);
  };
  const justLook = () => {
    setBrowsing(group, true);
    leave(next);
  };

  return (
    <>
      <Header title={res.data?.group.name ?? he.who.title} up={next} group={group} noChip />
      <main id="main" class="content">
        {res.error && !res.data ? (
          <ErrorState code={res.error} onRetry={res.reload} />
        ) : !res.data ? (
          <Loading />
        ) : (
          <>
            <h2 class="display sm">{he.who.title}</h2>
            <p class="muted">{families.length ? he.who.lead : he.who.empty}</p>
            <ul class="list">
              {byCreation(families).map((f) => (
                <li>
                  <button type="button" class="fampick" style={{ "--fc": famColor(f.color) }} onClick={() => sheet.open("confirm", { fam: f.id })}>
                    <span class="fdot lg" aria-hidden="true" />
                    <span class="grow1">
                      <b>{famLabel(f, families)}</b>
                      <small>{f.kids.length ? he.joinNames(f.kids.map((k) => k.name)) : he.who.noKids}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <a class={families.length ? "btn ghost big" : "btn big"} href={withQuery(`/join/${group}`, { new: "1", next: query.next })} onClick={replaceLink}>
              {he.who.newFamily}
            </a>
            <p class="center">
              <button type="button" class="lnk small" onClick={justLook}>
                {he.who.justLook}
              </button>
            </p>
          </>
        )}
      </main>
      <Sheet open={!!picked} title={he.who.confirmTitle} onClose={sheet.close}>
        {picked && (
          <ConfirmSentence
            parts={he.who.confirmParts(famLabel(picked, families))}
            note={he.who.confirmNote}
            confirm={he.who.confirm}
            onConfirm={() => choose(picked)}
            onCancel={sheet.close}
          />
        )}
      </Sheet>
    </>
  );
}
