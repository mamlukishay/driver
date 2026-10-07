import { useState } from "preact/hooks";
import { draftFrom, draftToInput, FamilyForm, uploadCarPhotos, type FamilyDraft } from "../components/FamilyForm.tsx";
import { Header, useIdentity, whoUrl } from "../components/Header.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { keys, setData, useGroup } from "../store.ts";
import type { GroupResponse } from "../../shared/types.ts";
import { appUrl, kidPath } from "../util.ts";
import { useConfig } from "./Join.tsx";

export function Profile({ group }: { group: string }) {
  const me = useIdentity(group);
  const res = useGroup(group);
  const { places } = useConfig();
  const fam = res.data?.me;
  return (
    <>
      <Header title={he.profile.title} up={`/g/${group}`} group={group} />
      <main id="main" class="content">
        {!me ? (
          <>
            <p class="note">{he.profile.notRegistered}</p>
            <a class="btn big" href={whoUrl(group, location.pathname + location.search)}>
              {he.group.joinCta}
            </a>
          </>
        ) : res.error && !res.data ? (
          <ErrorState code={res.error} onRetry={res.reload} />
        ) : !fam ? (
          <Loading />
        ) : (
          <ProfileBody group={group} fam={fam} places={places} data={res.data!} />
        )}
      </main>
    </>
  );
}

function ProfileBody({ group, fam, places, data }: { group: string; fam: NonNullable<GroupResponse["me"]>; places: boolean; data: GroupResponse }) {
  // Re-mount the form when the server copy changes version-wise (e.g. after save).
  const [initial] = useState<FamilyDraft>(() => draftFrom(fam));
  const save = async (d: FamilyDraft) => {
    try {
      const withPhotos = await uploadCarPhotos(group, d);
      const input = draftToInput(withPhotos);
      const r = await api.updateMe(group, input);
      setData<GroupResponse>(keys.group(group), { ...data, me: r.me });
      toast.info(he.profile.saved);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      <FamilyForm group={group} initial={initial} submitLabel={he.common.save} places={places} onSubmit={save} />
      {fam.kids.length > 0 && (
        <section class="card" aria-labelledby="kidlinks-h">
          <h2 class="hs" id="kidlinks-h">
            {he.profile.kidLinks}
          </h2>
          <p class="small muted">{he.profile.kidLinksHint}</p>
          {fam.kids.map((k) => (
            <WaButton class="btn wa" phone={k.phone} text={he.wa.kidLink(k.name, appUrl(kidPath(group, k.id)))}>
              {he.profile.sendKidLink(k.name)}
            </WaButton>
          ))}
        </section>
      )}
    </>
  );
}
