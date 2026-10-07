import { useLocation } from "preact-iso";
import { Header, useMe, whoUrl } from "../components/Header.tsx";
import { toast } from "../components/Toast.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { he } from "../i18n/he.ts";
import { removeIdentity, setBrowsing } from "../identity.ts";
import { useGroup } from "../store.ts";
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
      <Header title={he.settings.title} up={`/g/${group}`} group={group} />
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
      </main>
    </>
  );
}
