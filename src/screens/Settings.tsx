import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import { normalizeWaGroupUrl } from "../../shared/whatsapp.ts";
import { Field } from "../components/Field.tsx";
import { Header, useMe, whoUrl } from "../components/Header.tsx";
import { ConfirmSentence, Sheet } from "../components/Sheet.tsx";
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
  const linkRef = useRef<HTMLInputElement>(null);
  // Show the end of the link (the group's slug), not the host, when it does not fit.
  useEffect(() => {
    const el = linkRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [link]);

  const logout = () => {
    removeIdentity(group);
    setBrowsing(group, false);
    toast.info(he.settings.logoutDone);
    route(whoUrl(group, `/g/${group}`), true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.info(he.settings.copied);
    } catch {
      // No clipboard access (old browser, insecure origin): select the link so it can be copied by hand.
      linkRef.current?.focus();
      linkRef.current?.select();
    }
  };

  return (
    <>
      <Header title={grp.data?.group.name ?? he.common.loading} sub={he.settings.title} up={`/g/${group}`} group={group} titleIsGroup />
      <main id="main" class="content settings">
        <section class="card" aria-labelledby="me-h">
          <h2 class="hs" id="me-h">
            {he.settings.meTitle}
          </h2>
          {me ? (
            <>
              <p class="set-me" style={{ "--fc": famColor(me.family?.color ?? 0) }}>
                <span class="fdot lg" aria-hidden="true" />
                <b>{me.label}</b>
              </p>
              <div class="row">
                <a class="btn ghost grow1" href={`/g/${group}/me`}>
                  {he.settings.editProfile}
                </a>
                <a class="btn ghost grow1" href={whoUrl(group, here)}>
                  {he.settings.switchFamily}
                </a>
              </div>
              <button type="button" class="lnk quiet start" onClick={logout}>
                {he.settings.logout}
              </button>
            </>
          ) : (
            <>
              <p class="small muted">{he.settings.notChosen}</p>
              <a class="btn big" href={whoUrl(group, here)}>
                {he.settings.choose}
              </a>
            </>
          )}
        </section>
        {me && grp.data && <NameSection group={group} data={grp.data} />}
        <section class="card" aria-labelledby="share-h">
          <h2 class="hs" id="share-h">
            {he.settings.shareTitle}
          </h2>
          <p class="small muted">{he.settings.shareHint}</p>
          <div class="row">
            <div class="fld grow1">
              <input
                id="group-link"
                ref={linkRef}
                aria-label={he.settings.linkLabel}
                readOnly
                value={link}
                dir="ltr"
                onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
              />
            </div>
            <button type="button" class="btn ghost" onClick={() => void copyLink()}>
              {he.settings.copy}
            </button>
          </div>
          <WaButton class="btn wa big" text={he.wa.groupInvite(grp.data?.group.name ?? "", link)}>
            {he.settings.share}
          </WaButton>
        </section>
        {grp.data && <WaGroupSection group={group} data={grp.data} canEdit={!!me} />}
        {me && grp.data && <DeleteSection group={group} />}
      </main>
    </>
  );
}

/** "שם הקבוצה": rename the group (the link / slug never changes). */
function NameSection({ group, data }: { group: string; data: GroupResponse }) {
  const current = data.group.name;
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [current]);

  const save = async () => {
    const name = value.trim();
    if (!name || name === current) return;
    setBusy(true);
    try {
      const r = await api.updateGroup(group, { name });
      setData(keys.group(group), { ...data, group: r.group });
      setValue(r.group.name);
      toast.info(he.settings.nameSaved);
    } catch (x) {
      toast.error(x);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card" aria-labelledby="name-h">
      <h2 class="hs" id="name-h">
        {he.settings.nameTitle}
      </h2>
      <p class="small muted">{he.settings.nameHint}</p>
      <form
        class="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <Field id="group-name" label={he.settings.nameLabel} labelHidden value={value} maxLength={60} autoComplete="off" onInput={setValue} />
        <div class="row set-acts">
          <button type="submit" class="btn ghost" disabled={busy || !value.trim() || value.trim() === current}>
            {busy ? he.common.saving : he.settings.nameSave}
          </button>
        </div>
      </form>
    </section>
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
        <a class="btn ghost set-wa" href={current} target="_blank" rel="noopener noreferrer">
          <WaIcon />
          <span>{he.waGroup.open}</span>
        </a>
      )}
      {canEdit && (
        <form
          class="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(value);
          }}
          noValidate
        >
          <Field
            id="wa-group"
            label={he.settings.waLinkLabel}
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
          <div class="row set-acts">
            <button type="submit" class="btn ghost" disabled={busy || value.trim() === current}>
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

/** "מחיקת הקבוצה": a simple yes/no confirm sheet. */
function DeleteSection({ group }: { group: string }) {
  const sheet = useSheet();
  const { route } = useLocation();
  const open = sheet.name === "delete-group";
  const [busy, setBusy] = useState(false);

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
      <h2 class="hs" id="del-h">
        {he.settings.deleteTitle}
      </h2>
      <p class="small muted">{he.settings.deleteBody}</p>
      <button type="button" class="btn ghost danger start" onClick={() => sheet.open("delete-group")}>
        {he.settings.deleteOpen}
      </button>
      <Sheet open={open} title={he.settings.deleteTitle} onClose={sheet.close}>
        <ConfirmSentence
          parts={[he.settings.deleteBody]}
          confirm={he.settings.deleteYes}
          onConfirm={() => {
            if (!busy) void del();
          }}
          onCancel={sheet.close}
          busy={busy}
          danger
        />
      </Sheet>
    </section>
  );
}
