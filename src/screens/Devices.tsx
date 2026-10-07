import { useEffect, useState } from "preact/hooks";
import { Header, useIdentity } from "../components/Header.tsx";
import { Loading } from "../components/States.tsx";
import { WaButton } from "../components/WaButton.tsx";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { importFromFragment, setIdentity } from "../identity.ts";
import { useGroup } from "../store.ts";
import { appUrl } from "../util.ts";

export function Devices({ group }: { group: string }) {
  const [importing, setImporting] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const me = useIdentity(group);

  useEffect(() => {
    const key = importFromFragment();
    if (!key) return;
    setImporting("busy");
    api
      .getGroupWithKey(group, key)
      .then((g) => {
        if (!g.me) throw new Error("no me");
        setIdentity(group, { familyId: g.me.id, key, familyName: g.me.name, color: g.me.color, groupName: g.group.name });
        setImporting("ok");
      })
      .catch(() => setImporting("fail"));
  }, [group]);

  return (
    <>
      <Header title={he.devices.title} up={`/g/${group}`} group={group} />
      <main id="main" class="content">
        {importing === "busy" && <Loading />}
        {importing === "ok" && me && (
          <>
            <p class="note ok">
              <b>{he.devices.imported(me.familyName)}</b>
            </p>
            <a class="btn big" href={`/g/${group}`}>
              {he.join.toGroup}
            </a>
          </>
        )}
        {importing === "fail" && <p class="note gap">{he.devices.importFailed}</p>}
        {importing !== "ok" && importing !== "busy" && (me ? <DeviceLink group={group} keyStr={me.key} /> : <p class="note">{he.devices.notRegistered}</p>)}
      </main>
    </>
  );
}

function DeviceLink({ group, keyStr }: { group: string; keyStr: string }) {
  const grp = useGroup(group);
  const link = appUrl(`/g/${group}/devices#${keyStr}`);
  const parents = grp.data?.me?.parents ?? [];
  return (
    <>
      <p>{he.devices.lead}</p>
      <p class="note gap small">{he.devices.warn}</p>
      <div class="fld">
        <label for="device-link">{he.devices.linkLabel}</label>
        <input id="device-link" readOnly value={link} dir="ltr" onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
      </div>
      {parents.map((p) => (
        <WaButton class="btn wa big" phone={p.phone} text={he.wa.selfLink(link)}>
          {he.devices.sendSelf(p.name)}
        </WaButton>
      ))}
      {parents.length === 0 && (
        <WaButton class="btn wa big" text={he.wa.selfLink(link)}>
          {he.devices.sendOther}
        </WaButton>
      )}
    </>
  );
}
