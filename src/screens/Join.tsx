import { useLocation } from "preact-iso";
import { useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { FamilyPrivate, FamilyPublic } from "../../shared/types.ts";
import { familyDisplayName, sameNameFamilies } from "../../shared/familyLabel.ts";
import { prefillFrom } from "../../shared/myGroups.ts";
import { formatPhoneLocal } from "../../shared/phone.ts";
import {
  draftFrom,
  draftToInput,
  emptyDraft,
  FamilyForm,
  uploadCarPhotos,
  type FamilyDraft,
  type KidChoice,
} from "../components/FamilyForm.tsx";
import { Header, useMe, whoUrl } from "../components/Header.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { ErrorState, Loading } from "../components/States.tsx";
import { toast } from "../components/Toast.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { myGroupsByLastUsed, setBrowsing, setIdentity } from "../identity.ts";
import { useLeave, useReplaceLink, useSheet, withQuery } from "../nav.ts";
import { useGroup } from "../store.ts";
import { famLabel } from "../util.ts";
import { byCreation, safeNext } from "./Who.tsx";

export function useConfig() {
  const [places, setPlaces] = useState(false);
  const [inviteParse, setInviteParse] = useState(false);
  const [slugSuggest, setSlugSuggest] = useState(false);
  useEffect(() => {
    void api.getConfig().then((c) => {
      setPlaces(c.features.places);
      setInviteParse(c.features.inviteParse);
      setSlugSuggest(Boolean(c.features.slugSuggest));
    });
  }, []);
  return { places, inviteParse, slugSuggest };
}

/** This device's family in another group, to copy into the registration form. */
interface Source {
  slug: string;
  name: string;
  me: FamilyPrivate;
}

/** The families this device has in other groups (most recently used first); null while loading. */
function useSources(group: string, active: boolean): Source[] | null {
  const others = useMemo(() => myGroupsByLastUsed().filter((s) => s !== group), [group]);
  const [sources, setSources] = useState<Source[] | null>(others.length ? null : []);
  useEffect(() => {
    if (!active || others.length === 0) return;
    let live = true;
    void Promise.all(
      others.map((slug) =>
        api
          .getGroup(slug)
          .then((r): Source | null => (r.me ? { slug, name: r.group.name, me: r.me } : null))
          .catch(() => null),
      ),
    ).then((rs) => {
      if (live) setSources(rs.filter((x): x is Source => !!x));
    });
    return () => {
      live = false;
    };
  }, [active, others]);
  return active ? sources : [];
}

/** The registration draft and kid checkboxes copied from another group (an independent copy). */
function prefillDraft(src: Source): { draft: FamilyDraft; kids: KidChoice[] } {
  const p = prefillFrom(src.me);
  const kids = p.kids.map((k) => ({ name: k.name, phone: k.phone ? (formatPhoneLocal(k.phone) ?? k.phone) : "" }));
  const draft = draftFrom(p.family);
  if (kids.length === 0) draft.kids = [{ name: "", phone: "", rk: "r0" }];
  return { draft, kids };
}

/**
 * `/join/:group`: the invite link. Without a family on this phone it goes to "מי אתם?";
 * `?new=1` shows the registration form (with a "same name already here?" check).
 */
export function Join({ group }: { group: string }) {
  const { route, query } = useLocation();
  const me = useMe(group);
  const grp = useGroup(group);
  const { places, slugSuggest } = useConfig();
  const sheet = useSheet();
  const leave = useLeave();
  const replaceLink = useReplaceLink();
  const [initial] = useState<FamilyDraft>(emptyDraft);
  const [pending, setPending] = useState<FamilyDraft | null>(null);
  const next = safeNext(group, query.next);
  const registering = query.new === "1";
  const sources = useSources(group, registering && !me);
  // undefined = the default (most recently used group); "" = no copy.
  const [copySlug, setCopySlug] = useState<string | undefined>(undefined);
  const source = sources && (copySlug === undefined ? sources[0] : sources.find((x) => x.slug === copySlug));
  const pre = useMemo(() => (source ? prefillDraft(source) : null), [source]);

  useLayoutEffect(() => {
    if (!me && !registering) route(whoUrl(group, `/g/${group}`), true);
  }, [me, registering, group]);

  const families = grp.data?.families ?? [];
  // Same-name families already in the group (oldest first), while the "זו המשפחה שלכם?" sheet is open.
  const dups: FamilyPublic[] = sheet.name === "dup" && pending ? sameNameFamilies(pending.name, byCreation(families)) : [];

  /** `fromForm`: a taken kid link name is rethrown so the form marks the field (from the sheet it is a toast). */
  const register = async (d: FamilyDraft, fromForm = false) => {
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
            // Kids as just stored (no `slug`: their link names stay as they are).
            await api.updateMe(group, { ...again, kids: g2.me.kids.map((k) => ({ id: k.id, name: k.name, ...(k.phone ? { phone: k.phone } : {}) })) });
          }
        } catch (e) {
          toast.error(e);
        }
      }
      leave(next);
    } catch (e) {
      if (fromForm && e instanceof ApiError && e.code === "kid_slug_taken") throw e;
      toast.error(e);
    }
  };

  const submit = async (d: FamilyDraft) => {
    const same = sameNameFamilies(d.name, families);
    if (same.length > 0) {
      setPending(d);
      sheet.open("dup");
      return;
    }
    await register(d, true);
  };

  const pickExisting = (f: FamilyPublic) => {
    setIdentity(group, f.id);
    setBrowsing(group, false);
    leave(next);
  };

  return (
    <>
      <Header title={grp.data?.group.name ?? he.join.title} up="/" group={me ? group : undefined} />
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
        ) : !registering || !sources ? (
          <Loading />
        ) : (
          <>
            {families.length > 0 && (
              <p>
                <a class="lnk" href={withQuery(`/g/${group}/who`, { next: query.next })} onClick={replaceLink}>
                  {he.join.pickExisting}
                </a>
              </p>
            )}
            {sources.length > 0 && (
              <div class="fld copyfrom">
                <label for="copy-from">{he.join.copyFrom}</label>
                <select id="copy-from" value={source?.slug ?? ""} onChange={(e) => setCopySlug((e.currentTarget as HTMLSelectElement).value)}>
                  {sources.map((x) => (
                    <option value={x.slug}>{x.name}</option>
                  ))}
                  <option value="">{he.join.copyNone}</option>
                </select>
              </div>
            )}
            <FamilyForm
              key={source?.slug ?? ""}
              group={group}
              initial={pre?.draft ?? initial}
              kidChoices={pre?.kids}
              submitLabel={he.join.submit}
              places={places}
              slugSuggest={slugSuggest}
              cities={families.map((f) => f.city ?? "")}
              onSubmit={submit}
            />
          </>
        )}
      </main>
      <Sheet open={dups.length > 0} title={he.join.dupTitle} onClose={sheet.close}>
        {dups.length > 0 && (
          <>
            <p class="sent">
              {dups.length === 1
                ? he.join.dupText(he.family(familyDisplayName(dups[0]!).trim()), dups[0]!.kids.map((k) => k.name))
                : he.join.dupTextMany(familyDisplayName(dups[0]!).trim(), dups.length)}
            </p>
            <div class="stack">
              {dups.map((f, i) => (
                <button type="button" class="btn big" data-autofocus={i === 0 ? true : undefined} onClick={() => pickExisting(f)}>
                  {dups.length === 1 ? he.join.dupYes : he.join.dupYesOf(famLabel(f, families))}
                </button>
              ))}
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
