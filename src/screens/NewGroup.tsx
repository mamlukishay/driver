import { useState } from "preact/hooks";
import { Field } from "../components/Field.tsx";
import { Header } from "../components/Header.tsx";
import { toast } from "../components/Toast.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { appUrl } from "../util.ts";

export function NewGroup() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr(he.form.requiredField);
      document.getElementById("group-name")?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api.createGroup(name.trim());
      setCreated({ id: r.groupId, name: name.trim() });
    } catch (x) {
      toast.error(x);
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
          <a class="btn big" href={`/join/${created.id}`}>
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
          <Field id="group-name" label={he.newGroup.nameLabel} placeholder={he.newGroup.namePlaceholder} hint={he.newGroup.nameHint} value={name} error={err} onInput={(v) => (setName(v), setErr(null))} />
          <button type="submit" class="btn big" disabled={busy}>
            {busy ? he.common.saving : he.newGroup.submit}
          </button>
        </form>
      </main>
    </>
  );
}
