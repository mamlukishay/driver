import { useLocation } from "preact-iso";
import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import type { FamilyPublic } from "../../shared/types.ts";
import { sameNameFamilies } from "../../shared/familyLabel.ts";
import { draftToInput, emptyDraft, FamilyForm, uploadCarPhotos, type FamilyDraft } from "../components/FamilyForm.tsx";
import { Header, useMe, whoUrl } from "../components/Header.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { setBrowsing, setIdentity } from "../identity.ts";
import { useSheet, withQuery } from "../nav.ts";
import { useGroup } from "../store.ts";
import { safeNext } from "./Who.tsx";

export function useConfig() {
  const [places, setPlaces] = useState(false);
  const [inviteParse, setInviteParse] = useState(false);
  useEffect(() => {
    void api.getConfig().then((c) => {
      setPlaces(c.features.places);
      setInviteParse(c.features.inviteParse);
    });
  }, []);
  return { places, inviteParse };
}

/**
 * `/join/:group`: the invite link. Without a family on this phone it goes to "מי אתם?";
 * `?new=1` shows the registration form (with a "same name already here?" check).
 */
export function Join({ group }: { group: string }) {
  const { route, query } = useLocation();
  const me = useMe(group);
  const grp = useGroup(group);
  const { places } = useConfig();
  const sheet = useSheet();
  const [initial] = useState<FamilyDraft>(emptyDraft);
  const [pending, setPending] = useState<FamilyDraft | null>(null);
  const next = safeNext(group, query.next);
  const registering = query.new === "1";

  useLayoutEffect(() => {
    if (!me && !registering) route(whoUrl(group, `/g/${group}`), true);
  }, [me, registering, group]);

  const families = grp.data?.families ?? [];
  const dup: FamilyPublic | undefined = sheet.name === "dup" && pending ? families.find((f) => f.id === sheet.query.fam) : undefined;

  const register = async (d: FamilyDraft) => {
    try {
      const input = draftToInput({ ...d, cars: d.cars.map(({ photoId: _p, ...c }) => c) });
      const r = await api.register(group, input);
      setIdentity(group, r.familyId);
      setBrowsing(group, false);
      if (d.cars.some((c) => c.photoBlob)) {
        try {
          const g2 = await api.getGroup(group);
          if (g2.me) {
            const withPhotos = await uploadCarPhotos(group, d);
            const ids = g2.me.cars.map((c) => c.id);
            const again = draftToInput({ ...withPhotos, cars: withPhotos.cars.map((c, i) => ({ ...c, id: ids[i] })) });
            await api.updateMe(group, { ...again, kids: g2.me.kids.map((k) => ({ id: k.id, name: k.name, ...(k.phone ? { phone: k.phone } : {}) })) });
          }
        } catch (e) {
          toast.error(e);
        }
      }
      route(next, true);
    } catch (e) {
      toast.error(e);
    }
  };

  const submit = async (d: FamilyDraft) => {
    const same = sameNameFamilies(d.name, families);
    if (same.length > 0) {
      setPending(d);
      sheet.open("dup", { fam: same[0]!.id, new: "1", next: query.next });
      return;
    }
    await register(d);
  };

  const pickExisting = (f: FamilyPublic) => {
    setIdentity(group, f.id);
    setBrowsing(group, false);
    route(next, true);
  };

  const groupName = grp.data?.group.name;
  return (
    <>
      <Header title={he.join.invited} up="/" group={me ? group : undefined} />
      <main id="main" class="content">
        {grp.error && !grp.data ? (
          <ErrorState code={grp.error} onRetry={grp.reload} />
        ) : !grp.data ? (
          <Loading />
        ) : me ? (
          <section class="card">
            <p>{he.join.already(me.label)}</p>
            <a class="btn big" href={`/g/${group}`}>
              {he.join.toGroup}
            </a>
          </section>
        ) : !registering ? (
          <Loading />
        ) : (
          <>
            <section class="card invite-card">
              <span class="muted small">{he.join.invited}</span>
              <h2 class="display sm">
                {he.join.title("")}
                <mark>{groupName}</mark>
              </h2>
              <p class="small muted">{he.join.lead}</p>
              {families.length > 0 && (
                <a class="lnk" href={withQuery(`/g/${group}/who`, { next: query.next })}>
                  {he.join.pickExisting}
                </a>
              )}
            </section>
            <FamilyForm group={group} initial={initial} submitLabel={he.join.submit} places={places} onSubmit={submit} />
          </>
        )}
      </main>
      <Sheet open={!!dup} title={he.join.dupTitle} onClose={sheet.close}>
        {dup && (
          <>
            <p class="sent">{he.join.dupText(he.family(dup.name.trim()), dup.kids.map((k) => k.name))}</p>
            <div class="stack">
              <button type="button" class="btn big" data-autofocus onClick={() => pickExisting(dup)}>
                {he.join.dupYes}
              </button>
              <button
                type="button"
                class="btn ghost big"
                onClick={() => {
                  const d = pending!;
                  setPending(null);
                  void register(d);
                }}
              >
                {he.join.dupNo}
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
