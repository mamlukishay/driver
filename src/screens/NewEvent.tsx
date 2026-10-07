import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import type { EventInput, InviteParseResponse } from "../../shared/types.ts";
import { eventSlugBase, slugify } from "../../shared/slug.ts";
import { Field } from "../components/Field.tsx";
import { Header, useIdentity, whoUrl } from "../components/Header.tsx";
import { downscale, ImagePicker } from "../components/ImagePicker.tsx";
import { toast } from "../components/Toast.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { addMinutes, todayYmd } from "../util.ts";
import { useConfig } from "./Join.tsx";

type Key = keyof Omit<EventInput, "coverImageId">;

export function NewEvent({ group }: { group: string }) {
  const { route } = useLocation();
  const me = useIdentity(group);
  const { inviteParse } = useConfig();
  const [busyText, setBusyText] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cover, setCover] = useState<string | undefined>();
  const [f, setF] = useState<Omit<EventInput, "coverImageId">>({
    title: "",
    date: todayYmd(),
    start: "10:00",
    returnTime: "12:00",
    place: "",
    address: "",
  });
  const [hl, setHl] = useState<Set<Key>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [parsedOk, setParsedOk] = useState(false);
  const [errs, setErrs] = useState<Partial<Record<Key, string>>>({});
  const [saving, setSaving] = useState(false);
  const [slugWord, setSlugWord] = useState("");

  // Pasting an image anywhere on the page attaches it, like picking or dropping one.
  // A paste that carries text into a field stays a normal text paste.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {});
  pasteRef.current = (e) => {
    if (!me || busyText) return;
    const data = e.clipboardData;
    const file = [...(data?.files ?? [])].find((x) => x.type.startsWith("image/"));
    if (!file) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, [contenteditable]") && data?.getData("text/plain")) return;
    e.preventDefault();
    downscale(file, 1600).then(onPicked, (x) => toast.error(x instanceof Error && x.message === "too_large" ? he.image.tooBig : he.image.failed));
  };
  useEffect(() => {
    const h = (e: ClipboardEvent) => pasteRef.current(e);
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  }, []);

  if (!me) {
    return (
      <>
        <Header title={he.newEvent.title} up={`/g/${group}`} group={group} />
        <main id="main" class="content">
          <p class="note">{he.group.viewOnlyNote}</p>
          <a class="btn big" href={whoUrl(group, location.pathname + location.search)}>
            {he.group.joinCta}
          </a>
        </main>
      </>
    );
  }

  const set = (k: Key, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const applyParse = (p: InviteParseResponse) => {
    const next: Partial<typeof f> = {};
    const got = new Set<Key>();
    if (p.title) (next.title = p.title), got.add("title");
    if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) (next.date = p.date), got.add("date");
    const times = (p.times ?? []).filter((t) => /^\d{2}:\d{2}$/.test(t));
    if (times[0]) {
      next.start = times[0];
      got.add("start");
      next.returnTime = times.length > 1 ? times[times.length - 1]! : addMinutes(times[0], 120);
      got.add("returnTime");
    }
    if (p.place) (next.place = p.place), got.add("place");
    if (p.address) (next.address = p.address), got.add("address");
    setF((x) => ({ ...x, ...next }));
    setErrs({});
    setHl(got);
    setParsedOk(got.size > 0);
    if (times.length > 1) setNote(he.newEvent.multiTimes(times));
    else if (got.size === 0) setNote(he.newEvent.parseFailed);
  };

  const onPicked = async (blob: Blob) => {
    setPreview(URL.createObjectURL(blob));
    setNote(null);
    setParsedOk(false);
    setHl(new Set());
    setBusyText(he.newEvent.uploading);
    try {
      const { imageId } = await api.uploadImage(group, blob);
      setCover(imageId);
      if (inviteParse) {
        setBusyText(he.newEvent.parsing);
        try {
          applyParse(await api.parseInvite(group, imageId));
        } catch {
          setNote(he.newEvent.parseFailed);
        }
      }
    } catch (e) {
      toast.error(e);
      setPreview(null);
    } finally {
      setBusyText(null);
    }
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const er: Partial<Record<Key, string>> = {};
    for (const k of ["title", "date", "start", "returnTime", "place"] as Key[]) if (!f[k].trim()) er[k] = he.form.requiredField;
    setErrs(er);
    const first = Object.keys(er)[0];
    if (first) {
      document.getElementById(`ev-${first}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const word = slugify(slugWord, 20);
      const r = await api.createEvent(group, { ...f, ...(cover ? { coverImageId: cover } : {}), ...(word ? { slugWord: word } : {}) });
      route(`/g/${group}/e/${r.eventId}`);
    } catch (x) {
      toast.error(x);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header title={he.newEvent.title} up={`/g/${group}`} group={group} />
      <main id="main" class="content">
        <form class="stack-form" onSubmit={submit} noValidate>
          {busyText ? (
            <div class="card invite-busy" role="status">
              {preview && (
                <div class={`scan sm ${busyText === he.newEvent.parsing ? "on" : ""}`}>
                  <img src={preview} alt={he.newEvent.cover} />
                </div>
              )}
              <b>{busyText}</b>
            </div>
          ) : preview ? (
            <div class="row cover-row">
              <span class="cov">
                <img src={preview} alt={he.newEvent.cover} />
              </span>
              <button
                type="button"
                class="lnk"
                onClick={() => {
                  setPreview(null);
                  setCover(undefined);
                }}
              >
                {he.newEvent.removeCover}
              </button>
            </div>
          ) : (
            <ImagePicker
              id="invite-file"
              variant="drop"
              compact
              maxDim={1600}
              onPicked={onPicked}
              sub={<span class="small muted">{he.newEvent.dropHint}</span>}
            >
              <b>{inviteParse ? he.newEvent.dropParse : he.newEvent.drop}</b>
            </ImagePicker>
          )}
          {parsedOk && (
            <div class="note ok">
              <b>{he.newEvent.parsed}</b>
              <p class="small">{he.newEvent.parsedHint}</p>
            </div>
          )}
          {note && <p class="note gap small">{note}</p>}
          <section class="card">
            <Field id="ev-title" label={he.newEvent.fTitle} placeholder={he.newEvent.fTitlePlaceholder} value={f.title} highlight={hl.has("title")} error={errs.title} onInput={(v) => set("title", v)} />
            <Field id="ev-date" type="date" label={he.newEvent.fDate} value={f.date} highlight={hl.has("date")} error={errs.date} onInput={(v) => set("date", v)} />
            <div class="grid2">
              <Field id="ev-start" type="time" label={he.newEvent.fStart} value={f.start} highlight={hl.has("start")} error={errs.start} onInput={(v) => set("start", v)} />
              <Field id="ev-returnTime" type="time" label={he.newEvent.fReturn} hint={he.newEvent.fReturnHint} value={f.returnTime} highlight={hl.has("returnTime")} error={errs.returnTime} onInput={(v) => set("returnTime", v)} />
            </div>
            <Field id="ev-place" label={he.newEvent.fPlace} placeholder={he.newEvent.fPlacePlaceholder} value={f.place} highlight={hl.has("place")} error={errs.place} onInput={(v) => set("place", v)} />
            <Field id="ev-address" label={he.newEvent.fAddress} value={f.address} highlight={hl.has("address")} error={errs.address} onInput={(v) => set("address", v)} />
            <Field
              id="ev-slug"
              label={he.newEvent.fSlugWord}
              hint={he.newEvent.fSlugWordHint(eventSlugBase(f.date, slugWord))}
              value={slugWord}
              dir="ltr"
              autoComplete="off"
              maxLength={20}
              onInput={(v) => setSlugWord(v.toLowerCase().replace(/[^a-z0-9 -]/g, ""))}
            />
          </section>
          <button type="submit" class="btn big" disabled={saving}>
            {saving ? he.common.saving : he.newEvent.submit}
          </button>
        </form>
      </main>
    </>
  );
}
