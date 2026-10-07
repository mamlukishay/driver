import { useEffect, useRef, useState } from "preact/hooks";
import { isSlug, slugify, suggestGroupSlug } from "../../shared/slug.ts";
import { normalizeWaGroupUrl } from "../../shared/whatsapp.ts";
import { Field } from "../components/Field.tsx";
import { Header } from "../components/Header.tsx";
import { toast } from "../components/Toast.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { api, ApiError } from "../api.ts";
import { he } from "../i18n/he.ts";
import { clearGroupDeleted } from "../identity.ts";
import { appUrl } from "../util.ts";
import { useConfig } from "./Join.tsx";

/** Typing helper: lowercase, spaces → hyphens, drop anything not URL-safe (keeps a trailing hyphen while typing). */
const cleanSlugInput = (v: string) =>
  v
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);

/** Quiet time after the last name keystroke before asking the AI for an English URL name. */
const SUGGEST_DEBOUNCE_MS = 500;

export function NewGroup() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState(() => suggestGroupSlug(""));
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slugErr, setSlugErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [wa, setWa] = useState("");
  const [waErr, setWaErr] = useState<string | null>(null);

  const { slugSuggest } = useConfig();
  const [suggesting, setSuggesting] = useState(false);
  // Debounced AI suggestion for names without usable Latin (Hebrew): the pending timer / request, the latest name,
  // and the last slug the AI gave (kept while the name changes, until a new one arrives).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const latestName = useRef("");
  const aiSlug = useRef<string | null>(null);

  const cancelSuggest = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    inflight.current?.abort();
    inflight.current = null;
    setSuggesting(false);
  };
  useEffect(() => cancelSuggest, []);

  const askSuggestion = (v: string) => {
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setSuggesting(true);
    api
      .suggestSlug(v.trim(), ctrl.signal)
      .then((r) => {
        if (inflight.current !== ctrl || latestName.current !== v || !r.slug) return;
        aiSlug.current = r.slug;
        setSlug(r.slug);
      })
      .catch(() => {
        /* no suggestion: keep the fallback */
      })
      .finally(() => {
        if (inflight.current !== ctrl) return;
        inflight.current = null;
        setSuggesting(false);
      });
  };

  const onName = (v: string) => {
    setName(v);
    setErr(null);
    latestName.current = v;
    // Follow the name until the user edits the URL name; keep the random fallback (or the AI's slug) stable.
    if (!slugTouched) {
      const s = slugify(v);
      const keep = slug.startsWith("group-") || slug === aiSlug.current;
      setSlug(isSlug(s) ? s : keep ? slug : suggestGroupSlug(v));
      cancelSuggest();
      if (slugSuggest && v.trim() && !isSlug(s)) timer.current = setTimeout(() => askSuggestion(v), SUGGEST_DEBOUNCE_MS);
    }
  };
  const onSlug = (v: string) => {
    cancelSuggest();
    const c = cleanSlugInput(v);
    setSlug(c);
    setSlugTouched(true);
    setSuggestion(null);
    setSlugErr(c && !isSlug(c) ? he.newGroup.slugInvalid : null);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr(he.form.requiredField);
      document.getElementById("group-name")?.focus();
      return;
    }
    if (!isSlug(slug)) {
      setSlugErr(he.newGroup.slugInvalid);
      document.getElementById("group-slug")?.focus();
      return;
    }
    const waUrl = normalizeWaGroupUrl(wa);
    if (waUrl === null) {
      setWaErr(he.waGroup.invalid);
      document.getElementById("group-wa")?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api.createGroup(name.trim(), slug, waUrl || undefined);
      clearGroupDeleted(r.groupId);
      setCreated({ id: r.groupId, name: name.trim() });
    } catch (x) {
      if (x instanceof ApiError && x.code === "slug_taken") {
        const s = typeof x.data?.suggestion === "string" ? x.data.suggestion : undefined;
        setSlugErr(he.newGroup.slugTaken(s));
        setSuggestion(s ?? null);
        document.getElementById("group-slug")?.focus();
      } else toast.error(x);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const link = appUrl(`/join/${created.id}`);
    return (
      <>
        <Header title={he.newGroup.title} up="/" />
        <main id="main" class="content">
          <section class="card center">
            <h2 class="display sm">{he.newGroup.createdTitle}</h2>
            <p class="muted">{he.newGroup.createdBody}</p>
            <div class="fld">
              <label for="invite-link">{he.newGroup.linkLabel}</label>
              <input id="invite-link" readOnly value={link} dir="ltr" onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
            </div>
            <WaButton class="btn wa big" text={he.wa.groupInvite(created.name, link)}>
              {he.newGroup.share}
            </WaButton>
          </section>
          <a class="btn big" href={`/join/${created.id}?new=1`}>
            {he.newGroup.continue}
          </a>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title={he.newGroup.title} up="/" />
      <main id="main" class="content">
        <form class="card" onSubmit={submit} noValidate>
          <Field id="group-name" label={he.newGroup.nameLabel} placeholder={he.newGroup.namePlaceholder} value={name} error={err} onInput={onName} />
          <Field
            id="group-slug"
            label={he.newGroup.slugLabel}
            hint={he.newGroup.slugHint(appUrl(`/g/${slug || "…"}`))}
            value={slug}
            error={slugErr}
            dir="ltr"
            autoComplete="off"
            maxLength={40}
            busy={suggesting}
            onInput={onSlug}
          >
            <span class="vh" role="status">
              {suggesting ? he.newGroup.suggestingSlug : ""}
            </span>
            {suggestion && (
              <button type="button" class="lnk" onClick={() => onSlug(suggestion)}>
                {he.newGroup.useSuggestion(suggestion)}
              </button>
            )}
          </Field>
          <Field
            id="group-wa"
            label={he.waGroup.label}
            hint={he.waGroup.hint}
            value={wa}
            error={waErr}
            dir="ltr"
            autoComplete="off"
            placeholder="https://chat.whatsapp.com/…"
            onInput={(v) => {
              setWa(v);
              setWaErr(null);
            }}
          />
          <button type="submit" class="btn big" disabled={busy}>
            {busy ? he.common.saving : he.newGroup.submit}
          </button>
        </form>
      </main>
    </>
  );
}
