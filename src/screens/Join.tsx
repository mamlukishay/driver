import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { draftFrom, draftToInput, emptyDraft, FamilyForm, uploadCarPhotos, type FamilyDraft } from "../components/FamilyForm.tsx";
import { Header, useIdentity } from "../components/Header.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { getLastProfile, setIdentity, setLastProfile } from "../identity.ts";
import { useGroup } from "../store.ts";

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

export function Join({ group }: { group: string }) {
  const { route } = useLocation();
  const me = useIdentity(group);
  const grp = useGroup(group);
  const { places } = useConfig();
  const [showOther, setShowOther] = useState(false);
  const last = getLastProfile();
  const [initial] = useState<FamilyDraft>(() => (last ? draftFrom(last) : emptyDraft()));

  const submit = async (d: FamilyDraft) => {
    try {
      const input = draftToInput({ ...d, cars: d.cars.map(({ photoId: _p, ...c }) => c) });
      const r = await api.register(group, input);
      const g2 = await api.getGroupWithKey(group, r.key);
      setIdentity(group, {
        familyId: r.familyId,
        key: r.key,
        familyName: input.name,
        color: g2.me?.color ?? 0,
        groupName: g2.group.name,
      });
      setLastProfile(input);
      if (d.cars.some((c) => c.photoBlob) && g2.me) {
        try {
          const withPhotos = await uploadCarPhotos(group, d);
          const ids = g2.me.cars.map((c) => c.id);
          const again = draftToInput({ ...withPhotos, cars: withPhotos.cars.map((c, i) => ({ ...c, id: ids[i] })) });
          await api.updateMe(group, { ...again, kids: g2.me.kids.map((k) => ({ id: k.id, name: k.name, ...(k.phone ? { phone: k.phone } : {}) })) });
        } catch (e) {
          toast.error(e);
        }
      }
      route(`/g/${group}`);
    } catch (e) {
      toast.error(e);
    }
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
            <p>{he.join.already(me.familyName)}</p>
            <a class="btn big" href={`/g/${group}`}>
              {he.join.toGroup}
            </a>
          </section>
        ) : (
          <>
            <section class="card invite-card">
              <span class="muted small">{he.join.invited}</span>
              <h2 class="display sm">
                {he.join.title("")}
                <mark>{groupName}</mark>
              </h2>
              <p class="small muted">{he.join.lead}</p>
              <button type="button" class="lnk" aria-expanded={showOther} onClick={() => setShowOther(!showOther)}>
                {he.join.otherDevice}
              </button>
              {showOther && <p class="note small">{he.join.otherDeviceHelp}</p>}
            </section>
            {last && <p class="note small">{he.join.prefilled}</p>}
            <FamilyForm group={group} initial={initial} submitLabel={he.join.submit} places={places} onSubmit={submit} />
          </>
        )}
      </main>
    </>
  );
}
