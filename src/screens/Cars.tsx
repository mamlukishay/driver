/** "הרכבים שלי" (`/g/:group/me/cars`): this family's cars in this group (each group keeps its own copy). */
import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { CarsFields, draftFrom, draftToInput, newCar, uploadCarPhotos, validateCars, type CarDraft } from "../components/FamilyForm.tsx";
import { Header, useIdentity, whoUrl } from "../components/Header.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { keys, setData, useGroup } from "../store.ts";
import type { FamilyPrivate, GroupResponse } from "../../shared/types.ts";

export function Cars({ group }: { group: string }) {
  const me = useIdentity(group);
  const res = useGroup(group);
  const fam = res.data?.me;
  return (
    <>
      <Header title={he.cars.title} up={`/g/${group}`} group={group} groupLine />
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
          <CarsBody group={group} fam={fam} data={res.data!} />
        )}
      </main>
    </>
  );
}

function CarsBody({ group, fam, data }: { group: string; fam: FamilyPrivate; data: GroupResponse }) {
  // `?add=1` (from the board's "להוספת רכב"): start with a new, empty car card.
  const add = useLocation().query.add === "1";
  const [cars, setCars] = useState<CarDraft[]>(() => {
    const stored = draftFrom(fam).cars;
    return add ? [...stored, newCar()] : stored;
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = tried ? validateCars(cars) : {};
  const err = (id: string) => errors[id] ?? null;

  useEffect(() => {
    if (!add) return;
    // Drop `?add=1` so a reload doesn't add another card (the entry's history state is kept).
    history.replaceState(null, "", location.pathname);
    const t = setTimeout(() => {
      const el = document.getElementById(`car-${cars.length - 1}-label`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const save = async (ev: Event) => {
    ev.preventDefault();
    setTried(true);
    const first = Object.keys(validateCars(cars))[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    try {
      // The rest of the family as stored now; only the cars change.
      const withPhotos = await uploadCarPhotos(group, { ...draftFrom(fam), cars });
      const r = await api.updateMe(group, draftToInput(withPhotos));
      setData<GroupResponse>(keys.group(group), { ...data, me: r.me });
      setCars(draftFrom(r.me).cars);
      setTried(false);
      toast.info(he.cars.saved);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="stack-form" onSubmit={save} noValidate>
      <CarsFields group={group} cars={cars} err={err} heading={false} onChange={(f) => setCars((x) => f(x))} />
      {Object.keys(errors).length > 0 && (
        <p class="note gap" role="alert">
          {he.form.fixErrors}
        </p>
      )}
      <button type="submit" class="btn big sticky-cta" disabled={busy}>
        {busy ? he.common.saving : he.common.save}
      </button>
    </form>
  );
}
