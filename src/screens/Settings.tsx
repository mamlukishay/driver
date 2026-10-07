import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { normalizeWaGroupUrl } from "../../shared/whatsapp.ts";
import { Field } from "../components/Field.tsx";
import { Header, useMe, whoUrl } from "../components/Header.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { toast } from "../components/Toast.tsx";
import { WaButton, WaIcon } from "../components/WaButton.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { forgetGroup, removeIdentity, setBrowsing } from "../identity.ts";
import { useSheet } from "../nav.ts";
import { keys, setData, useGroup } from "../store.ts";
import type { GroupResponse } from "../../shared/types.ts";
import { appUrl, famColor } from "../util.ts";

export function Settings({ group }: { group: string }) {
  const { route } = useLocation();
  const me = useMe(group);
  const grp = useGroup(group);
  const link = appUrl(`/join/${group}`);
  const here = `/g/${group}/settings`;

  const logout = () => {
    removeIdentity(group);
    setBrowsing(group, false);
    toast.info(he.settings.logoutDone);
    route(whoUrl(group, `/g/${group}`), true);
  };

  return (
    <>
      <Header title={he.settings.title} up={`/g/${group}`} group={group} groupLine />
      <main id="main" class="content">
        <section class="card">
          {me ? (
            <p class="row" style={{ "--fc": famColor(me.family?.color ?? 0) }}>
              <span class="fdot lg" aria-hidden="true" />
              <b>{he.settings.actingAs(me.label)}</b>
            </p>
          ) : (
            <p>{he.settings.notChosen}</p>
          )}
          <a class="btn big" href={whoUrl(group, here)}>
            {me ? he.settings.switchFamily : he.settings.choose}
          </a>
          {me && (
            <>
              <a class="btn ghost big" href={`/g/${group}/me`}>
                {he.settings.editProfile}
              </a>
              <button type="button" class="btn ghost big danger" onClick={logout}>
                {he.settings.logout}
              </button>
            </>
          )}
        </section>
        <section class="card" aria-labelledby="share-h">
          <h2 class="hs" id="share-h">
            {he.settings.shareTitle}
          </h2>
          <p class="small muted">{he.settings.shareHint}</p>
          <div class="fld">
            <label for="group-link">{he.settings.linkLabel}</label>
            <input id="group-link" readOnly value={link} dir="ltr" onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
          </div>
          <WaButton class="btn wa big" text={he.wa.groupInvite(grp.data?.group.name ?? "", link)}>
            {he.settings.share}
          </WaButton>
        </section>
        {grp.data && <WaGroupSection group={group} data={grp.data} canEdit={!!me} />}
        {me && grp.data && <DeleteSection group={group} name={grp.data.group.name} />}
      </main>
    </>
  );
}

/** The linked parents' WhatsApp group: open it, and set / change / remove the link. */
function WaGroupSection({ group, data, canEdit }: { group: string; data: GroupResponse; canEdit: boolean }) {
  const current = data.group.whatsappUrl ?? "";
  const [value, setValue] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [current]);

  const save = async (raw: string) => {
    const norm = normalizeWaGroupUrl(raw);
    if (norm === null) {
      setErr(he.waGroup.invalid);
      document.getElementById("wa-group")?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api.updateGroup(group, { whatsappUrl: norm });
      setData(keys.group(group), { ...data, group: r.group });
      setValue(r.group.whatsappUrl ?? "");
      toast.info(norm ? he.settings.waSaved : he.settings.waRemoved);
    } catch (x) {
      toast.error(x);
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit && !current) return null;
  return (
    <section class="card" aria-labelledby="wa-h">
      <h2 class="hs" id="wa-h">
        {he.settings.waTitle}
      </h2>
      {current && (
        <a class="btn wa big" href={current} target="_blank" rel="noopener noreferrer">
          <WaIcon />
          <span>{he.waGroup.open}</span>
        </a>
      )}
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(value);
          }}
          noValidate
        >
          <Field
            id="wa-group"
            label={he.waGroup.label}
            hint={he.waGroup.hint}
            value={value}
            error={err}
            dir="ltr"
            autoComplete="off"
            placeholder="https://chat.whatsapp.com/…"
            onInput={(v) => {
              setValue(v);
              setErr(null);
            }}
          />
          <div class="row">
            <button type="submit" class="btn ghost grow1" disabled={busy || value.trim() === current}>
              {busy ? he.common.saving : he.settings.waSave}
            </button>
            {current && (
              <button type="button" class="lnk bad" disabled={busy} onClick={() => void save("")}>
                {he.settings.waRemove}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** "מחיקת הקבוצה": a confirm sheet that needs the group's name typed exactly. */
function DeleteSection({ group, name }: { group: string; name: string }) {
  const sheet = useSheet();
  const { route } = useLocation();
  const open = sheet.name === "delete-group";
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const del = async () => {
    setBusy(true);
    try {
      await api.deleteGroup(group);
      forgetGroup(group);
      toast.info(he.settings.deleted);
      route("/", true);
    } catch (x) {
      toast.error(x);
      setBusy(false);
    }
  };

  return (
    <section class="card" aria-labelledby="del-h">
      <h2 class="hs bad" id="del-h">
        {he.settings.deleteTitle}
      </h2>
      <button type="button" class="btn ghost big danger" onClick={() => sheet.open("delete-group")}>
        {he.settings.deleteOpen}
      </button>
      <Sheet open={open} title={he.settings.deleteTitle} onClose={sheet.close}>
        <form
          class="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim() === name && !busy) void del();
          }}
          noValidate
        >
          <p>{he.settings.deleteBody}</p>
          <Field id="del-name" label={he.settings.deleteType(name)} value={typed} autoComplete="off" onInput={setTyped} />
          <button type="submit" class="btn big danger" disabled={busy || typed.trim() !== name}>
            {busy ? he.settings.deleting : he.settings.deleteYes}
          </button>
        </form>
      </Sheet>
    </section>
  );
}
