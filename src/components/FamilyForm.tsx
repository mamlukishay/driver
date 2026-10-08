/** Registration / profile form: family name, parents and drivers + phones, address (street + city), kids, cars. */
import { useEffect, useRef, useState } from "preact/hooks";
import type { FamilyInput, FamilyPrivate } from "../../shared/types.ts";
import { formatPhoneLocal, normalizePhone } from "../../shared/phone.ts";
import { isKidSlug, KID_SLUG_MAX, slugify } from "../../shared/slug.ts";
import { isJunkName, MAX_PARENTS } from "../../shared/validate.ts";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { getIdentity } from "../identity.ts";
import { toast } from "./Toast.tsx";
import { cx } from "../util.ts";
import { CarGlyph } from "./CarCard.tsx";
import { Field, PhoneInput, phoneError, Stepper } from "./Field.tsx";
import { ImagePicker } from "./ImagePicker.tsx";

export interface CarDraft {
  id?: string;
  label: string;
  seats: number;
  color: string;
  plate: string;
  photoId?: string;
  photoBlob?: Blob;
  photoPreview?: string;
}

export interface KidDraft {
  id?: string;
  name: string;
  phone: string;
  /** Link name (`/g/:group/kid/<slug>`); "" = none (links use the id). */
  slug?: string;
  /** The slug is a suggestion (AI or from a Latin name), not typed. */
  slugAuto?: boolean;
  /** The user edited the slug: no more suggestions for this row. */
  slugTouched?: boolean;
  /** Stable row key for a kid without an id yet. */
  rk?: string;
}

export interface FamilyDraft {
  name: string;
  /** Parents and other drivers; `id` keeps a stored person (and the rides they drive) through an edit. */
  parents: { id?: string; name: string; phone: string }[];
  /** Street + house number. */
  address: string;
  city: string;
  kids: KidDraft[];
  cars: CarDraft[];
}

let rowSeq = 0;
const newKidRow = (): KidDraft => ({ name: "", phone: "", rk: `r${++rowSeq}` });

const MAX_SEATS_UI = 8;

export function emptyDraft(): FamilyDraft {
  return { name: "", parents: [{ name: "", phone: "" }], address: "", city: "", kids: [newKidRow()], cars: [] };
}

const local = (p?: string) => (p ? (formatPhoneLocal(p) ?? p) : "");
/** A stored name for an editable field: legacy junk ("undefined", missing) becomes an empty, required field. */
const nameField = (v: unknown) => (isJunkName(v) ? "" : (v as string));

export function draftFrom(f: FamilyInput | FamilyPrivate): FamilyDraft {
  return {
    name: nameField(f.name),
    address: f.address ?? "",
    city: f.city ?? "",
    parents: f.parents.length
      ? f.parents.map((p) => ({ ...(p.id ? { id: p.id } : {}), name: nameField(p.name), phone: local(p.phone) }))
      : [{ name: "", phone: "" }],
    kids: f.kids.map((k) => ({
      ...("id" in k && k.id ? { id: k.id } : {}),
      name: nameField(k.name),
      phone: local(k.phone),
      slug: k.slug ?? "",
    })),
    cars: f.cars.map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      label: c.label,
      seats: Math.min(MAX_SEATS_UI, Math.max(1, c.seats)),
      color: c.color ?? "",
      plate: c.plate ?? "",
      ...(c.photoId ? { photoId: c.photoId } : {}),
    })),
  };
}

export function draftToInput(d: FamilyDraft): FamilyInput {
  return {
    name: d.name.trim(),
    address: d.address.trim(),
    ...(d.city.trim() ? { city: d.city.trim() } : {}),
    parents: d.parents.map((p) => ({ ...(p.id ? { id: p.id } : {}), name: p.name.trim(), phone: normalizePhone(p.phone) ?? p.phone })),
    kids: d.kids
      .filter((k) => k.name.trim())
      .map((k) => ({
        ...(k.id ? { id: k.id } : {}),
        name: k.name.trim(),
        ...(k.phone.trim() ? { phone: normalizePhone(k.phone) ?? k.phone } : {}),
        // Always sent: "" clears a stored link name (it stays reserved as an alias).
        slug: (k.slug ?? "").trim(),
      })),
    cars: d.cars.map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      label: c.label.trim(),
      seats: c.seats,
      ...(c.color.trim() ? { color: c.color.trim() } : {}),
      ...(c.plate.trim() ? { plate: c.plate.trim() } : {}),
      ...(c.photoId ? { photoId: c.photoId } : {}),
    })),
  };
}

/** A kid from this family's registration in another group, offered as a checkbox (unchecked). */
export interface KidChoice {
  name: string;
  phone: string;
}

/** The kids to register: the checked choices first, then the named rows. */
export function kidsWithChoices(d: FamilyDraft, choices: readonly KidChoice[], picked: readonly boolean[]): FamilyDraft {
  return { ...d, kids: [...choices.filter((_, i) => picked[i]).map((k) => ({ ...k })), ...d.kids] };
}

/** `taken`: link names the server said belong to another kid (they stay marked until changed). */
function validate(d: FamilyDraft, pickedCount: number | null = null, withCars = true, taken: readonly string[] = []): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name.trim()) e["fam-name"] = he.form.requiredField;
  d.parents.forEach((p, i) => {
    if (!p.name.trim()) e[`parent-${i}-name`] = he.form.requiredField;
    const pe = phoneError(p.phone, true);
    if (pe) e[`parent-${i}-phone`] = pe;
  });
  // A street without a city can send navigation to the wrong town.
  if (d.address.trim() && !d.city.trim()) e["fam-city"] = he.form.requiredField;
  d.kids.forEach((k, i) => {
    const alone = pickedCount === null && d.kids.length === 1;
    if (!k.name.trim() && (k.phone.trim() || alone)) e[`kid-${i}-name`] = he.form.requiredField;
    const ke = phoneError(k.phone, false);
    if (ke) e[`kid-${i}-phone`] = ke;
    const slug = (k.slug ?? "").trim();
    if (slug && k.name.trim()) {
      if (!isKidSlug(slug)) e[`kid-${i}-slug`] = he.form.kidSlugInvalid;
      else if (taken.includes(slug) || d.kids.some((o, j) => j < i && o.name.trim() && (o.slug ?? "").trim() === slug))
        e[`kid-${i}-slug`] = he.form.kidSlugTaken;
    }
  });
  // With kid choices (copied from another group): at least one checked or added kid.
  if (pickedCount !== null && pickedCount + d.kids.filter((k) => k.name.trim()).length === 0) e["kid-pick-0"] = he.form.kidsPickRequired;
  return withCars ? { ...e, ...validateCars(d.cars) } : e;
}

/** Errors for the car cards, keyed by field id (`car-<i>-label`, `car-<i>-plate`). */
export function validateCars(cars: readonly CarDraft[]): Record<string, string> {
  const e: Record<string, string> = {};
  cars.forEach((c, i) => {
    if (!c.label.trim()) e[`car-${i}-label`] = he.form.requiredField;
    if (c.plate && !/^\d{1,3}$/.test(c.plate.trim())) e[`car-${i}-plate`] = he.form.plateInvalid;
  });
  return e;
}

export const MAX_CARS = 5;
export const newCar = (): CarDraft => ({ label: "", seats: 4, color: "", plate: "" });

interface Props {
  group: string;
  initial: FamilyDraft;
  submitLabel: string;
  places: boolean;
  /** Workers AI can suggest kid link names (`features.slugSuggest`). */
  slugSuggest?: boolean;
  /** Kids from another group, shown as unchecked checkboxes; only checked or added kids are submitted. */
  kidChoices?: readonly KidChoice[];
  /** false: no car fields (the family page; cars live on `/g/:group/me/cars`). The draft's cars are submitted unchanged. */
  cars?: boolean;
  /** Cities of the group's other families, offered as suggestions for the city field (never auto-filled). */
  cities?: readonly string[];
  /** Show validation errors from the start (e.g. a stored family whose name is missing). */
  revealErrors?: boolean;
  /** May throw `ApiError("kid_slug_taken")` (with `data.slug`): the form marks that kid's link field. */
  onSubmit: (d: FamilyDraft) => Promise<void>;
}

export function FamilyForm({ group, initial, submitLabel, places, slugSuggest = false, kidChoices, cities, revealErrors, cars = true, onSubmit }: Props) {
  const [d, setD] = useState<FamilyDraft>(initial);
  const choices = kidChoices?.length ? kidChoices : null;
  const [picked, setPicked] = useState<boolean[]>(() => (choices ? choices.map(() => false) : []));
  const pickedCount = choices ? picked.filter(Boolean).length : null;
  const [errors, setErrors] = useState<Record<string, string>>(() => (revealErrors ? validate(initial, pickedCount, cars) : {}));
  const [tried, setTried] = useState(!!revealErrors);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<string[]>([]);
  const up = (f: (x: FamilyDraft) => FamilyDraft) => setD((x) => f(cloneDraft(x)));

  const submit = async (ev: Event) => {
    ev.preventDefault();
    const e = validate(d, pickedCount, cars, taken);
    setErrors(e);
    setTried(true);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(choices ? kidsWithChoices(d, choices, picked) : d);
    } catch (x) {
      // A kid link name another kid already answers to: mark that field (onSubmit rethrows only this).
      const slug = x instanceof ApiError && x.code === "kid_slug_taken" ? x.data?.slug : undefined;
      const i = typeof slug === "string" ? d.kids.findIndex((k) => (k.slug ?? "").trim() === slug) : -1;
      if (i < 0) {
        toast.error(x);
        return;
      }
      const t = [...taken, slug as string];
      setTaken(t);
      setErrors(validate(d, pickedCount, cars, t));
      document.getElementById(`kid-${i}-slug`)?.focus();
    } finally {
      setBusy(false);
    }
  };
  const err = (id: string) => (tried ? (errors[id] ?? null) : null);
  useEffect(() => {
    if (tried) setErrors(validate(d, pickedCount, cars, taken));
  }, [d, picked]);

  return (
    <form class="stack-form" onSubmit={submit} noValidate>
      <section class="card">
        <Field id="fam-name" label={he.form.familyName} hint={d.name.trim() ? he.form.familyNameHint(d.name.trim()) : undefined} value={d.name} error={err("fam-name")} autoComplete="family-name" onInput={(v) => up((x) => ({ ...x, name: v }))} />
      </section>

      <section class="card" aria-labelledby="parents-h">
        <h2 class="hs" id="parents-h">{he.form.parents}</h2>
        <p class="small muted">{he.form.parentsHint}</p>
        {d.parents.map((p, i) => (
          <div class="sub">
            <Field id={`parent-${i}-name`} label={he.form.parentName} value={p.name} error={err(`parent-${i}-name`)} autoComplete="given-name" onInput={(v) => up((x) => (x.parents[i]!.name = v, x))} />
            <PhoneInput id={`parent-${i}-phone`} label={he.form.parentPhone} value={p.phone} required showErrors={tried} onInput={(v) => up((x) => (x.parents[i]!.phone = v, x))} />
            {i > 0 && (
              <button type="button" class="lnk bad" onClick={() => up((x) => (x.parents.splice(i, 1), x))}>
                {he.form.removeParent}
              </button>
            )}
          </div>
        ))}
        {d.parents.length < MAX_PARENTS && (
          <button type="button" class="mini" onClick={() => up((x) => (x.parents.push({ name: "", phone: "" }), x))}>
            {he.form.addParent}
          </button>
        )}
      </section>

      <AddressCard
        group={group}
        places={places}
        street={d.address}
        city={d.city}
        cities={cities}
        cityError={err("fam-city")}
        onStreet={(v) => up((x) => ({ ...x, address: v }))}
        onCity={(v) => up((x) => ({ ...x, city: v }))}
      />

      <section class="card" aria-labelledby="kids-h">
        <h2 class="hs" id="kids-h">
          {choices ? he.form.kidsPick : he.form.kids}
        </h2>
        {choices && (
          <div class="kidpick" role="group" aria-labelledby="kids-h">
            {choices.map((k, i) => (
              <label class="kidpick-i">
                <input
                  type="checkbox"
                  id={`kid-pick-${i}`}
                  checked={!!picked[i]}
                  aria-invalid={err("kid-pick-0") ? true : undefined}
                  onChange={(ev) => {
                    const on = (ev.currentTarget as HTMLInputElement).checked;
                    setPicked((p) => p.map((x, j) => (j === i ? on : x)));
                  }}
                />
                <span>
                  <b>{k.name}</b>
                  {k.phone && <small class="num"> · {k.phone}</small>}
                </span>
              </label>
            ))}
            {err("kid-pick-0") && (
              <span class="hint bad" role="alert">
                {err("kid-pick-0")}
              </span>
            )}
          </div>
        )}
        {d.kids.map((k, i) => (
          <div class="sub" key={k.id ?? k.rk ?? i}>
            <Field id={`kid-${i}-name`} label={he.form.kidName} value={k.name} error={err(`kid-${i}-name`)} onInput={(v) => up((x) => (x.kids[i]!.name = v, x))} />
            <PhoneInput id={`kid-${i}-phone`} label={he.form.kidPhone} value={k.phone} showErrors={tried} onInput={(v) => up((x) => (x.kids[i]!.phone = v, x))} />
            <KidSlugField
              id={`kid-${i}-slug`}
              group={group}
              kid={k}
              others={d.kids.filter((_, j) => j !== i).map((o) => (o.slug ?? "").trim()).filter(Boolean)}
              suggest={slugSuggest}
              error={err(`kid-${i}-slug`)}
              onChange={(slug, auto) =>
                up((x) => {
                  const row = x.kids[i]!;
                  row.slug = slug;
                  row.slugAuto = auto;
                  if (!auto) row.slugTouched = true;
                  return x;
                })
              }
            />
            {(choices || d.kids.length > 1) && (
              <button type="button" class="lnk bad" onClick={() => up((x) => (x.kids.splice(i, 1), x))}>
                {he.form.removeKid}
              </button>
            )}
          </div>
        ))}
        {d.kids.length + picked.filter(Boolean).length < 12 && (
          <button type="button" class="mini" onClick={() => up((x) => (x.kids.push(newKidRow()), x))}>
            {he.form.addKid}
          </button>
        )}
      </section>

      {cars && <CarsFields group={group} cars={d.cars} err={err} onChange={(f) => up((x) => ({ ...x, cars: f(x.cars) }))} />}

      {tried && Object.keys(errors).length > 0 && (
        <p class="note gap" role="alert">
          {he.form.fixErrors}
        </p>
      )}
      <button type="submit" class="btn big sticky-cta" disabled={busy}>
        {busy ? he.common.saving : submitLabel}
      </button>
    </form>
  );
}

/** Typing helper: lowercase, spaces → hyphens, drop anything not URL-safe (keeps a trailing hyphen while typing). */
const cleanKidSlugInput = (v: string) =>
  v
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, KID_SLUG_MAX);

const HEBREW = /[\u0590-\u05FF]/;
/** Quiet time after the last name keystroke before asking the AI for a link name. */
const SUGGEST_DEBOUNCE_MS = 500;

/**
 * "כתובת הקישור של {kid}": the URL start, then the kid's link name (LTR, mono). While the row's slug is empty
 * or still a suggestion (and never typed), it follows the name: a Latin first name on the spot, a Hebrew one
 * via `POST /api/g/:group/suggest-slug` (`kind: "kid"`, debounced, the previous request cancelled). The
 * suggestion is marked as one; the family's own spelling is the real thing.
 */
function KidSlugField({
  id,
  group,
  kid,
  others,
  suggest,
  error,
  onChange,
}: {
  id: string;
  group: string;
  kid: KidDraft;
  /** Link names on the form's other rows (the suggestion skips them). */
  others: string[];
  suggest: boolean;
  error: string | null;
  onChange: (slug: string, auto: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const latest = useRef({ kid, others, onChange });
  latest.current = { kid, others, onChange };
  const slug = kid.slug ?? "";
  const following = !kid.slugTouched && (!slug || !!kid.slugAuto);
  const name = kid.name.trim();
  useEffect(() => {
    if (!following) return;
    const apply = (s: string) => {
      const cur = latest.current;
      if ((cur.kid.slug ?? "") !== s) cur.onChange(s, !!s);
    };
    if (!name) {
      if (kid.slugAuto) apply("");
      return;
    }
    if (!HEBREW.test(name)) {
      const s = slugify(name.split(" ")[0]!, 24);
      apply(isKidSlug(s) && !latest.current.others.includes(s) ? s : "");
      return;
    }
    if (!suggest) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      const { kid: k, others: o } = latest.current;
      api
        .suggestGroupSlug(group, { kind: "kid", name, ...(k.id ? { kidId: k.id } : {}), ...(o.length ? { taken: o } : {}) }, ctrl.signal)
        .then((r) => {
          if (!ctrl.signal.aborted && r.slug) apply(r.slug);
        })
        .catch(() => {
          /* no suggestion: the field stays as it is */
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setBusy(false);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      setBusy(false);
    };
  }, [group, name, suggest, following]);

  const hintId = `${id}-hint`;
  const hint = error ?? (kid.slugAuto && slug ? he.form.kidSlugSuggested : null);
  return (
    <div class={cx("fld", error && "err")}>
      <label for={id}>{he.form.kidSlugLabel(name)}</label>
      <div class="urlbox">
        <span class="urlbox-pre" aria-hidden="true">
          <bdi dir="ltr">{`${location.host}/g/${group}/kid/`}</bdi>
        </span>
        <span class={cx("inwrap", busy && "busy")}>
          <input
            id={id}
            type="text"
            value={slug}
            dir="ltr"
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            maxLength={KID_SLUG_MAX}
            aria-invalid={error ? true : undefined}
            aria-busy={busy || undefined}
            aria-describedby={hint ? hintId : undefined}
            onInput={(e) => onChange(cleanKidSlugInput((e.currentTarget as HTMLInputElement).value), false)}
          />
          {busy && <i class="spin" aria-hidden="true" />}
        </span>
      </div>
      {hint && (
        <span class="hint" id={hintId}>
          {hint}
        </span>
      )}
      <span class="vh" role="status">
        {busy ? he.form.suggestingKidSlug : ""}
      </span>
    </div>
  );
}

/** The car cards (label, seats, color, plate, photo, remove) + "+ רכב": registration and `/g/:group/me/cars`. */
export function CarsFields({
  group,
  cars,
  err,
  onChange,
  heading = true,
}: {
  group: string;
  cars: readonly CarDraft[];
  err: (id: string) => string | null;
  /** Gets an updater that may mutate the (already cloned) array and its cars. */
  onChange: (f: (cars: CarDraft[]) => CarDraft[]) => void;
  /** false: no visible "רכבים" heading (the page title already says it). */
  heading?: boolean;
}) {
  const up = (f: (x: CarDraft[]) => CarDraft[]) => onChange((x) => f(x.map((c) => ({ ...c }))));
  return (
    <section class="card" {...(heading ? { "aria-labelledby": "cars-h" } : { "aria-label": he.form.cars })}>
      {heading && (
        <h2 class="hs" id="cars-h">
          {he.form.cars}
        </h2>
      )}
      {cars.length === 0 && <p class="small muted">{he.form.carsHint}</p>}
      {cars.map((c, i) => (
        <div class="sub">
          <Field id={`car-${i}-label`} label={he.form.carLabel} placeholder={he.form.carLabelPlaceholder} value={c.label} error={err(`car-${i}-label`)} onInput={(v) => up((x) => (x[i]!.label = v, x))} />
          <Stepper id={`car-${i}-seats`} label={he.form.carSeats} hint={he.form.carSeatsHint} value={c.seats} min={1} max={MAX_SEATS_UI} onChange={(n) => up((x) => (x[i]!.seats = n, x))} />
          <div class="grid2">
            <Field id={`car-${i}-color`} label={he.form.carColor} value={c.color} onInput={(v) => up((x) => (x[i]!.color = v, x))} />
            <Field id={`car-${i}-plate`} label={he.form.carPlate} value={c.plate} inputMode="numeric" maxLength={3} dir="ltr" error={err(`car-${i}-plate`)} onInput={(v) => up((x) => (x[i]!.plate = v.replace(/\D/g, ""), x))} />
          </div>
          <div class="row">
            <span class="cth">
              {c.photoPreview || c.photoId ? (
                <img src={c.photoPreview ?? api.imageUrl(group, c.photoId!)} alt={c.label} />
              ) : (
                <CarGlyph color={0} size={22} />
              )}
            </span>
            <ImagePicker
              id={`car-${i}-photo`}
              variant="button"
              maxDim={800}
              onPicked={(blob) =>
                up((x) => {
                  const car = x[i]!;
                  car.photoBlob = blob;
                  car.photoPreview = URL.createObjectURL(blob);
                  delete car.photoId;
                  return x;
                })
              }
            >
              {c.photoPreview || c.photoId ? he.form.carPhotoReplace : he.form.carPhoto}
            </ImagePicker>
            {(c.photoPreview || c.photoId) && (
              <button
                type="button"
                class="lnk"
                onClick={() =>
                  up((x) => {
                    const car = x[i]!;
                    delete car.photoId;
                    delete car.photoBlob;
                    delete car.photoPreview;
                    return x;
                  })
                }
              >
                {he.form.carPhotoRemove}
              </button>
            )}
          </div>
          <button type="button" class="lnk bad" onClick={() => up((x) => (x.splice(i, 1), x))}>
            {he.form.removeCar}
          </button>
        </div>
      ))}
      {cars.length < MAX_CARS && (
        <button type="button" class="mini" onClick={() => up((x) => (x.push(newCar()), x))}>
          {he.form.addCar}
        </button>
      )}
    </section>
  );
}

function cloneDraft(x: FamilyDraft): FamilyDraft {
  return {
    ...x,
    parents: x.parents.map((p) => ({ ...p })),
    kids: x.kids.map((k) => ({ ...k })),
    cars: x.cars.map((c) => ({ ...c })),
  };
}

/** The first comma part of a Places secondary text: "פרדס חנה-כרכור, ישראל" → "פרדס חנה-כרכור". */
export const cityFromSecondary = (secondary: string) => secondary.split(",")[0]!.trim();

/** "כתובת הבית": street + house number (with Places suggestions) and city (with the group's cities). */
function AddressCard({
  group,
  places,
  street,
  city,
  cities,
  cityError,
  onStreet,
  onCity,
}: {
  group: string;
  places: boolean;
  street: string;
  city: string;
  cities?: readonly string[];
  cityError: string | null;
  onStreet: (v: string) => void;
  onCity: (v: string) => void;
}) {
  type Sug = { text: string; main?: string; secondary?: string };
  const [sugs, setSugs] = useState<Sug[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const picked = useRef(false);
  // Places needs a family key; at first registration there is none yet, so it stays a plain field.
  const canSuggest = places && !!getIdentity(group);
  useEffect(() => {
    if (!canSuggest || picked.current || street.trim().length < 3) {
      setSugs([]);
      picked.current = false;
      return;
    }
    clearTimeout(timer.current);
    const q = city.trim() ? `${street.trim()}, ${city.trim()}` : street.trim();
    timer.current = setTimeout(() => {
      api
        .places(group, q)
        .then((r) => setSugs((r.suggestions ?? []).slice(0, 5)))
        .catch(() => setSugs([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [street, canSuggest]);
  const cityList = [...new Set((cities ?? []).map((c) => c.trim()).filter(Boolean))];
  return (
    <section class="card" aria-labelledby="address-h">
      <h2 class="hs" id="address-h">
        {he.form.address}
      </h2>
      <p class="small muted">{he.form.addressHint}</p>
      <Field id="fam-address" label={he.form.street} value={street} autoComplete="address-line1" onInput={onStreet}>
        {sugs.length > 0 && (
          <ul class="sug" aria-label={he.form.addressSuggestions}>
            {sugs.map((s) => (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    picked.current = true;
                    setSugs([]);
                    onStreet(s.main || s.text);
                    if (s.secondary) {
                      const c = cityFromSecondary(s.secondary);
                      if (c) onCity(c);
                    }
                  }}
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>
      <Field id="fam-city" label={he.form.city} value={city} error={cityError} autoComplete="address-level2" list={cityList.length ? "fam-city-list" : undefined} onInput={onCity}>
        {cityList.length > 0 && (
          <datalist id="fam-city-list">
            {cityList.map((c) => (
              <option value={c} />
            ))}
          </datalist>
        )}
      </Field>
    </section>
  );
}

/** Uploads any newly picked car photos (needs a family key) and returns the draft with photoIds. */
export async function uploadCarPhotos(group: string, d: FamilyDraft): Promise<FamilyDraft> {
  const out = cloneDraft(d);
  for (const c of out.cars) {
    if (!c.photoBlob) continue;
    const r = await api.uploadImage(group, c.photoBlob);
    c.photoId = r.imageId;
    delete c.photoBlob;
  }
  return out;
}
