/** Registration / profile form: family name, parents and drivers + phones, address, kids, cars. */
import { useEffect, useRef, useState } from "preact/hooks";
import type { FamilyInput, FamilyPrivate } from "../../shared/types.ts";
import { formatPhoneLocal, normalizePhone } from "../../shared/phone.ts";
import { isJunkName, MAX_PARENTS } from "../../shared/validate.ts";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { getIdentity } from "../identity.ts";
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

export interface FamilyDraft {
  name: string;
  /** Parents and other drivers; `id` keeps a stored person (and the rides they drive) through an edit. */
  parents: { id?: string; name: string; phone: string }[];
  address: string;
  kids: { id?: string; name: string; phone: string }[];
  cars: CarDraft[];
}

const MAX_SEATS_UI = 8;

export function emptyDraft(): FamilyDraft {
  return { name: "", parents: [{ name: "", phone: "" }], address: "", kids: [{ name: "", phone: "" }], cars: [] };
}

const local = (p?: string) => (p ? (formatPhoneLocal(p) ?? p) : "");
/** A stored name for an editable field: legacy junk ("undefined", missing) becomes an empty, required field. */
const nameField = (v: unknown) => (isJunkName(v) ? "" : (v as string));

export function draftFrom(f: FamilyInput | FamilyPrivate): FamilyDraft {
  return {
    name: nameField(f.name),
    address: f.address ?? "",
    parents: f.parents.length
      ? f.parents.map((p) => ({ ...(p.id ? { id: p.id } : {}), name: nameField(p.name), phone: local(p.phone) }))
      : [{ name: "", phone: "" }],
    kids: f.kids.map((k) => ({
      ...("id" in k && k.id ? { id: k.id } : {}),
      name: nameField(k.name),
      phone: local(k.phone),
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
    parents: d.parents.map((p) => ({ ...(p.id ? { id: p.id } : {}), name: p.name.trim(), phone: normalizePhone(p.phone) ?? p.phone })),
    kids: d.kids
      .filter((k) => k.name.trim())
      .map((k) => ({
        ...(k.id ? { id: k.id } : {}),
        name: k.name.trim(),
        ...(k.phone.trim() ? { phone: normalizePhone(k.phone) ?? k.phone } : {}),
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

function validate(d: FamilyDraft, pickedCount: number | null = null, withCars = true): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name.trim()) e["fam-name"] = he.form.requiredField;
  d.parents.forEach((p, i) => {
    if (!p.name.trim()) e[`parent-${i}-name`] = he.form.requiredField;
    const pe = phoneError(p.phone, true);
    if (pe) e[`parent-${i}-phone`] = pe;
  });
  d.kids.forEach((k, i) => {
    const alone = pickedCount === null && d.kids.length === 1;
    if (!k.name.trim() && (k.phone.trim() || alone)) e[`kid-${i}-name`] = he.form.requiredField;
    const ke = phoneError(k.phone, false);
    if (ke) e[`kid-${i}-phone`] = ke;
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
  /** Kids from another group, shown as unchecked checkboxes; only checked or added kids are submitted. */
  kidChoices?: readonly KidChoice[];
  /** false: no car fields (the family page; cars live on `/g/:group/me/cars`). The draft's cars are submitted unchanged. */
  cars?: boolean;
  /** Show validation errors from the start (e.g. a stored family whose name is missing). */
  revealErrors?: boolean;
  onSubmit: (d: FamilyDraft) => Promise<void>;
}

export function FamilyForm({ group, initial, submitLabel, places, kidChoices, revealErrors, cars = true, onSubmit }: Props) {
  const [d, setD] = useState<FamilyDraft>(initial);
  const choices = kidChoices?.length ? kidChoices : null;
  const [picked, setPicked] = useState<boolean[]>(() => (choices ? choices.map(() => false) : []));
  const pickedCount = choices ? picked.filter(Boolean).length : null;
  const [errors, setErrors] = useState<Record<string, string>>(() => (revealErrors ? validate(initial, pickedCount, cars) : {}));
  const [tried, setTried] = useState(!!revealErrors);
  const [busy, setBusy] = useState(false);
  const up = (f: (x: FamilyDraft) => FamilyDraft) => setD((x) => f(cloneDraft(x)));

  const submit = async (ev: Event) => {
    ev.preventDefault();
    const e = validate(d, pickedCount, cars);
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
    } finally {
      setBusy(false);
    }
  };
  const err = (id: string) => (tried ? (errors[id] ?? null) : null);
  useEffect(() => {
    if (tried) setErrors(validate(d, pickedCount, cars));
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

      <section class="card">
        <AddressField group={group} places={places} value={d.address} onInput={(v) => up((x) => ({ ...x, address: v }))} />
      </section>

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
          <div class="sub">
            <Field id={`kid-${i}-name`} label={he.form.kidName} value={k.name} error={err(`kid-${i}-name`)} onInput={(v) => up((x) => (x.kids[i]!.name = v, x))} />
            <PhoneInput id={`kid-${i}-phone`} label={he.form.kidPhone} value={k.phone} showErrors={tried} onInput={(v) => up((x) => (x.kids[i]!.phone = v, x))} />
            {(choices || d.kids.length > 1) && (
              <button type="button" class="lnk bad" onClick={() => up((x) => (x.kids.splice(i, 1), x))}>
                {he.form.removeKid}
              </button>
            )}
          </div>
        ))}
        {d.kids.length + picked.filter(Boolean).length < 12 && (
          <button type="button" class="mini" onClick={() => up((x) => (x.kids.push({ name: "", phone: "" }), x))}>
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

function AddressField({ group, places, value, onInput }: { group: string; places: boolean; value: string; onInput: (v: string) => void }) {
  const [sugs, setSugs] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const picked = useRef(false);
  // Places needs a family key; at first registration there is none yet, so it stays a plain field.
  const canSuggest = places && !!getIdentity(group);
  useEffect(() => {
    if (!canSuggest || picked.current || value.trim().length < 3) {
      setSugs([]);
      picked.current = false;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .places(group, value.trim())
        .then((r) => setSugs((r.suggestions ?? []).map((s) => s.text).slice(0, 5)))
        .catch(() => setSugs([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [value, canSuggest]);
  return (
    <Field id="fam-address" label={he.form.address} hint={he.form.addressHint} value={value} autoComplete="street-address" onInput={onInput}>
      {sugs.length > 0 && (
        <ul class="sug" aria-label={he.form.addressSuggestions}>
          {sugs.map((s) => (
            <li>
              <button
                type="button"
                onClick={() => {
                  picked.current = true;
                  setSugs([]);
                  onInput(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
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
