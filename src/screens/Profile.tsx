import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { CarPic, Plate } from "../components/CarCard.tsx";
import { draftFrom, draftToInput, FamilyForm, type FamilyDraft } from "../components/FamilyForm.tsx";
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
      <Header title={he.profile.title} up={`/g/${group}`} group={group} groupLine />
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
          <>
            <p class="small muted">
              {he.profile.notYou}{" "}
              <a class="lnk" href={whoUrl(group, `/g/${group}`)}>
                {he.profile.switchFamily}
              </a>
            </p>
            <ProfileBody group={group} fam={fam} places={places} data={res.data!} />
          </>
        )}
      </main>
    </>
  );
}

function ProfileBody({ group, fam, places, data }: { group: string; fam: NonNullable<GroupResponse["me"]>; places: boolean; data: GroupResponse }) {
  // Re-mount the form when the server copy changes version-wise (e.g. after save).
  const [initial, setInitial] = useState<FamilyDraft>(() => draftFrom(fam));
  const [formKey, setFormKey] = useState(0);
  // `?focus=kid-<kidId>-phone` (from "+ הוספת טלפון ל…"): scroll to that kid's phone field and focus it.
  const focus = useLocation().query.focus;
  useEffect(() => {
    const kidId = /^kid-(.+)-phone$/.exec(focus ?? "")?.[1];
    const i = kidId ? fam.kids.findIndex((k) => k.id === kidId) : -1;
    if (i < 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`kid-${i}-phone`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(t);
  }, [focus]);
  const save = async (d: FamilyDraft) => {
    try {
      // Cars are edited on their own page: send them as stored now, never a stale copy.
      const input = draftToInput({ ...d, cars: draftFrom(fam).cars });
      const r = await api.updateMe(group, input);
      setData<GroupResponse>(keys.group(group), { ...data, me: r.me });
      // New people and kids got ids on the server: edit the saved copy from now on, so they keep them.
      setInitial(draftFrom(r.me));
      setFormKey((k) => k + 1);
      toast.info(he.profile.saved);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      <FamilyForm key={formKey} group={group} initial={initial} submitLabel={he.common.save} places={places} cars={false} revealErrors={!initial.name} onSubmit={save} />
      <section class="card" aria-labelledby="cars-sum-h">
        <h2 class="hs" id="cars-sum-h">
          {he.cars.summary}
        </h2>
        {fam.cars.length === 0 ? (
          <p class="small muted">{he.cars.none}</p>
        ) : (
          <ul class="list">
            {fam.cars.map((c) => (
              <li key={c.id} class="row">
                <CarPic group={group} car={c} color={fam.color} />
                <span class="grow1">
                  <b>{c.label}</b>
                  <span class="muted"> · {he.cars.seats(c.seats)}</span>
                </span>
                <Plate plate={c.plate} />
              </li>
            ))}
          </ul>
        )}
        <a class="btn ghost" href={`/g/${group}/me/cars`}>
          {he.cars.manage}
        </a>
      </section>
      {fam.kids.length > 0 && (
        <section class="card" aria-labelledby="kidlinks-h">
          <h2 class="hs" id="kidlinks-h">
            {he.profile.kidLinks}
          </h2>
          {fam.kids.map((k, i) =>
            k.phone ? (
              <WaButton class="btn wa" phone={k.phone} text={he.wa.kidLink(k.name, appUrl(kidPath(group, k.id)))}>
                {he.profile.sendKidLink(k.name)}
              </WaButton>
            ) : (
              // KISS: no phone, no sending; jump to the kid's phone field instead.
              <button
                type="button"
                class="lnk start"
                onClick={() => {
                  const el = document.getElementById(`kid-${i}-phone`);
                  el?.scrollIntoView({ block: "center" });
                  el?.focus({ preventScroll: true });
                }}
              >
                {he.manage.noPhone(k.name)}
              </button>
            ),
          )}
        </section>
      )}
    </>
  );
}
