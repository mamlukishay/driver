/**
 * The event screen's shared frame for its three tabs (פרטים | הלוך | חזור): the event header with
 * the ⋯ menu, the cancelled / "עודכן" banners, the tab bar (route replace, gap dots, swipe) and the
 * menu, edit and cancel sheets.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { EventPatch, EventView, Leg } from "../../shared/types.ts";
import { Field } from "../components/Field.tsx";
import { ImagePicker } from "../components/ImagePicker.tsx";
import { ConfirmSentence, Sheet } from "../components/Sheet.tsx";
import { toast } from "../components/Toast.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { useReplace, useSheet } from "../nav.ts";
import { appUrl, cx, eventIndex, famColor, fmtClock, fmtDate, legTime } from "../util.ts";
import { EventHead, latestTimeChange, logLine, runAction, summaryText } from "./eventCommon.tsx";

export type EventTab = "details" | Leg;
const TABS: readonly EventTab[] = ["details", "out", "back"];

const tabUrl = (group: string, ev: string, tab: EventTab) => (tab === "details" ? `/g/${group}/e/${ev}` : `/g/${group}/e/${ev}/${tab}`);

/** Swipes that start this close to a screen edge belong to the browser (iOS edge swipe-back). */
const EDGE_PX = 24;
const SWIPE_MIN_PX = 60;

export function EventFrame({ group, ev, tab, children }: { group: string; ev: EventView; tab: EventTab; children: ComponentChildren }) {
  const sheet = useSheet();
  const replace = useReplace();
  const go = (t: EventTab) => {
    if (t !== tab) replace(tabUrl(group, ev.id, t));
  };

  // Swipe between tabs. RTL: the next tab sits to the left, so a finger moving right brings it in.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = null;
    if (!t || e.touches.length > 1 || sheet.name) return;
    if (t.clientX < EDGE_PX || t.clientX > innerWidth - EDGE_PX) return;
    if ((e.target as HTMLElement | null)?.closest("input,textarea,select,.ov")) return;
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const rtl = document.documentElement.dir !== "ltr";
    const step = (dx > 0) === rtl ? 1 : -1;
    const next = TABS[TABS.indexOf(tab) + step];
    if (next) go(next);
  };

  return (
    <div class={cx("evframe", ev.cancelled && "is-cancelled")} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div class="evh-row">
        <EventHead group={group} ev={ev} />
        <button type="button" class="dots" aria-label={he.manage.menu} title={he.manage.menu} onClick={() => sheet.open("menu")}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="19" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
      {ev.cancelled ? <CancelledNote group={group} ev={ev} /> : <UpdateBanner group={group} ev={ev} />}
      <nav class="tabs" aria-label={he.manage.tabs}>
        {TABS.map((t) => {
          const gap = t === "details" ? null : ev.gaps[t];
          const dot = gap ? (gap.need === 0 ? "none" : gap.state) : null;
          return (
            <a
              href={tabUrl(group, ev.id, t)}
              aria-current={t === tab ? "page" : undefined}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                // Keep preact-iso's global link handler from pushing a history entry.
                e.stopPropagation();
                go(t);
              }}
            >
              {t === "details" ? (
                he.manage.details
              ) : (
                <>
                  {dot && <span class={`gdot ${dot}`} data-gap={dot} aria-hidden="true" />}
                  {he.legName[t]} · <time class="num">{legTime(ev, t)}</time>
                  {dot && <span class="vh"> · {he.manage.gapLabel[dot]}</span>}
                </>
              )}
            </a>
          );
        })}
      </nav>
      {children}
      <MenuSheet group={group} ev={ev} />
      <EditSheet group={group} ev={ev} />
      <CancelSheet group={group} ev={ev} />
    </div>
  );
}

function CancelledNote({ group, ev }: { group: string; ev: EventView }) {
  return (
    <div class="note cancel-note" role="status">
      <b>
        <span class="tag off">{he.manage.cancelledTag}</span> {he.manage.cancelled}
      </b>
      <span class="small">{he.manage.cancelledNote}</span>
      <WaButton class="mini" text={cancelText(group, ev)}>
        {he.manage.shareCancel}
      </WaButton>
    </div>
  );
}

const cancelText = (group: string, ev: EventView) =>
  he.manage.waCancel({ title: ev.title, date: fmtDate(ev.date), url: appUrl(`/g/${group}/e/${ev.id}`) });

/* ---------- "עודכן" banner (dismissed per device) ---------- */

const DISMISS_KEY = "trempush.dismissedUpdates";

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function UpdateBanner({ group, ev }: { group: string; ev: EventView }) {
  const change = latestTimeChange(ev);
  const key = `${group}/${ev.id}`;
  const [dismissed, setDismissed] = useState(() => readDismissed()[key]);
  if (!change || dismissed === change.logId) return null;
  const dismiss = () => {
    setDismissed(change.logId);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ ...readDismissed(), [key]: change.logId }));
    } catch {
      /* private mode: dismissed for this visit only */
    }
  };
  const text = he.manage.waUpdate({ title: ev.title, date: fmtDate(ev.date), lines: change.lines, url: appUrl(`/g/${group}/e/${ev.id}`) });
  return (
    <div class="note upd" role="status" aria-label={he.manage.updatedTag}>
      <div class="row sp upd-h">
        <span class="tag upd-tag">{he.manage.updatedTag}</span>
        <button type="button" class="xbtn" onClick={dismiss} aria-label={he.manage.dismiss}>
          ×
        </button>
      </div>
      {change.lines.map((l) => (
        <b>{l}</b>
      ))}
      <WaButton class="mini" text={text}>
        {he.manage.shareUpdate}
      </WaButton>
    </div>
  );
}

/* ---------- sheets ---------- */

function MenuSheet({ group, ev }: { group: string; ev: EventView }) {
  const sheet = useSheet();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    const ok = await runAction(group, ev, { type: "restoreEvent" }, he.manage.toastRestored);
    setBusy(false);
    if (ok) sheet.close();
  };
  return (
    <Sheet open={sheet.name === "menu"} title={he.manage.menuTitle} onClose={sheet.close}>
      <div class="menu-list">
        <button type="button" class="menu-i" onClick={() => sheet.swap("edit")} data-autofocus>
          {he.manage.edit}
        </button>
        <WaButton class="menu-i" text={ev.cancelled ? cancelText(group, ev) : summaryText(group, ev)}>
          {he.manage.share}
        </WaButton>
        {ev.cancelled ? (
          <button type="button" class="menu-i" onClick={restore} disabled={busy}>
            {he.manage.restore}
          </button>
        ) : (
          <button type="button" class="menu-i bad" onClick={() => sheet.swap("cancel")}>
            {he.manage.cancel}
          </button>
        )}
      </div>
    </Sheet>
  );
}

type Draft = { title: string; date: string; start: string; returnTime: string; place: string; address: string; cover: string | null };
const draftOf = (ev: EventView): Draft => ({
  title: ev.title,
  date: ev.date,
  start: ev.start,
  returnTime: ev.returnTime,
  place: ev.place,
  address: ev.address,
  cover: ev.coverImageId ?? null,
});

function EditSheet({ group, ev }: { group: string; ev: EventView }) {
  const sheet = useSheet();
  const open = sheet.name === "edit";
  const [d, setD] = useState<Draft>(() => draftOf(ev));
  const [errs, setErrs] = useState<Partial<Record<keyof Draft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (open) {
      setD(draftOf(ev));
      setErrs({});
    }
  }, [open]);

  const set = (k: keyof Draft, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const onCover = async (blob: Blob) => {
    setUploading(true);
    try {
      const { imageId } = await api.uploadImage(group, blob);
      setD((x) => ({ ...x, cover: imageId }));
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const er: Partial<Record<keyof Draft, string>> = {};
    for (const k of ["title", "date", "start", "returnTime", "place"] as const) if (!d[k].trim()) er[k] = he.form.requiredField;
    setErrs(er);
    const first = Object.keys(er)[0];
    if (first) {
      document.getElementById(`ed-${first}`)?.focus();
      return;
    }
    const patch: EventPatch = {};
    for (const k of ["title", "date", "start", "returnTime", "place", "address"] as const) {
      const v = d[k].trim();
      if (v !== ev[k]) patch[k] = v;
    }
    if (d.cover !== (ev.coverImageId ?? null)) patch.coverImageId = d.cover;
    if (Object.keys(patch).length === 0) {
      sheet.close();
      toast.info(he.manage.noChange);
      return;
    }
    setBusy(true);
    const ok = await runAction(group, ev, { type: "editEvent", patch }, he.manage.toastEdited);
    setBusy(false);
    if (ok) sheet.close();
  };

  return (
    <Sheet open={open} title={he.manage.editTitle} onClose={sheet.close} full>
      <form class="stack-form" onSubmit={submit} noValidate>
        <Field id="ed-title" label={he.newEvent.fTitle} value={d.title} error={errs.title} onInput={(v) => set("title", v)} />
        <Field id="ed-date" type="date" label={he.newEvent.fDate} value={d.date} error={errs.date} onInput={(v) => set("date", v)} />
        <div class="grid2">
          <Field id="ed-start" type="time" label={he.newEvent.fStart} value={d.start} error={errs.start} onInput={(v) => set("start", v)} />
          <Field id="ed-returnTime" type="time" label={he.newEvent.fReturn} value={d.returnTime} error={errs.returnTime} onInput={(v) => set("returnTime", v)} />
        </div>
        <Field id="ed-place" label={he.newEvent.fPlace} value={d.place} error={errs.place} onInput={(v) => set("place", v)} />
        <Field id="ed-address" label={he.newEvent.fAddress} value={d.address} onInput={(v) => set("address", v)} />
        <div class="row cover-row">
          {d.cover && (
            <span class="cov">
              <img src={api.imageUrl(group, d.cover)} alt={he.newEvent.cover} />
            </span>
          )}
          <ImagePicker id="ed-cover" variant="button" maxDim={1600} onPicked={onCover}>
            {uploading ? he.newEvent.uploading : d.cover ? he.manage.coverReplace : he.manage.coverAdd}
          </ImagePicker>
          {d.cover && (
            <button type="button" class="lnk bad" onClick={() => setD((x) => ({ ...x, cover: null }))}>
              {he.newEvent.removeCover}
            </button>
          )}
        </div>
        <button type="submit" class="btn big" disabled={busy || uploading}>
          {busy ? he.common.saving : he.common.save}
        </button>
      </form>
    </Sheet>
  );
}

function CancelSheet({ group, ev }: { group: string; ev: EventView }) {
  const sheet = useSheet();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const ok = await runAction(group, ev, { type: "cancelEvent" }, he.manage.toastCancelled);
    setBusy(false);
    if (ok) sheet.close();
  };
  return (
    <Sheet open={sheet.name === "cancel" && !ev.cancelled} title={he.manage.cancelTitle} onClose={sheet.close}>
      <ConfirmSentence
        parts={he.manage.cancelParts(ev.title)}
        note={he.manage.cancelNote}
        confirm={he.manage.cancelYes}
        onConfirm={confirm}
        onCancel={sheet.close}
        busy={busy}
        danger
      />
    </Sheet>
  );
}

/* ---------- history (on the פרטים tab) ---------- */

export function EventHistory({ ev }: { ev: EventView }) {
  const idx = eventIndex(ev);
  const log = [...ev.log].reverse().slice(0, 8);
  return (
    <section class="card" aria-labelledby="log-h">
      <h2 class="hs" id="log-h">
        {he.board.history}
      </h2>
      {log.length === 0 ? (
        <p class="small muted">{he.board.noHistory}</p>
      ) : (
        <ul class="logl">
          {log.map((l) => (
            <li class={l.undoneBy ? "undone" : ""}>
              <time class="t num">{fmtClock(l.at)}</time>
              <span class="fdot" style={{ "--fc": famColor(idx.fam(l.familyId)?.color ?? 0) }} aria-hidden="true" />
              <span>
                {logLine(ev, l)} {l.undoneBy && <small>{he.log.undone}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

