import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { he } from "../i18n/he.ts";
import type { FamilyPublic, GroupResponse } from "../../shared/types.ts";
import { getIdentity, onIdentityChange } from "../identity.ts";
import { useBack } from "../nav.ts";
import { api } from "../api.ts";
import { keys, useResource } from "../store.ts";
import { famColor, famLabel, useForce } from "../util.ts";

/** This device's family id for the group (re-renders on change). */
export function useIdentity(group: string | undefined): string | null {
  const force = useForce();
  useEffect(() => {
    const off = onIdentityChange(force);
    return () => void off();
  }, []);
  return group ? getIdentity(group) : null;
}

export interface Me {
  familyId: string;
  /** From the group payload; undefined while loading. */
  family: FamilyPublic | undefined;
  /** "משפחת X", disambiguated; "…" while loading. */
  label: string;
}

/** The family this device acts as, with its display label (loads the group, cached). */
export function useMe(group: string | undefined): Me | null {
  const familyId = useIdentity(group);
  // Same cache entry as useGroup(group); no fetch when there is no group or no family.
  const res = useResource<GroupResponse>(group && familyId ? keys.group(group) : null, () => api.getGroup(group!));
  if (!group || !familyId) return null;
  const families = res.data?.families ?? [];
  const family = families.find((f) => f.id === familyId);
  return { familyId, family, label: family ? famLabel(family, families) : "…" };
}

interface Props {
  title: string;
  /** Parent screen for the back button when there is no in-app history. Omit on root screens. */
  up?: string;
  group?: string;
  /** Hide the identity chip (home, kid page). */
  noChip?: boolean;
  children?: ComponentChildren;
}

export function Header({ title, up, group, noChip, children }: Props) {
  const back = useBack(up ?? "/");
  return (
    <header class="hdr">
      <div class="hdr-row">
        {up !== undefined ? (
          <button type="button" class="bk" onClick={back} aria-label={he.common.back}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        ) : (
          <span class="brand-dot" aria-hidden="true" />
        )}
        <h1 class="attl">{title}</h1>
        {children}
        {group && (
          <a class="gear" href={`/g/${group}/settings`} aria-label={he.identity.settings} title={he.identity.settings}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
                d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zm7.4-3.2c0-.5 0-.9-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.9 7.9 0 000 2.6l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.3z"
              />
            </svg>
          </a>
        )}
      </div>
      {group && !noChip && <IdentityChip group={group} />}
    </header>
  );
}

function IdentityChip({ group }: { group: string }) {
  const me = useMe(group);
  if (!me)
    return (
      <div class="who anon">
        <span>{he.identity.viewOnly}</span>
        <a class="lnk" href={whoUrl(group, location.pathname + location.search)}>
          {he.identity.joinCta}
        </a>
      </div>
    );
  return (
    <a class="who" href={`/g/${group}/settings`} title={he.identity.chipHint} style={{ "--fc": famColor(me.family?.color ?? 0) }}>
      <span class="fdot" aria-hidden="true" />
      <span>
        {he.identity.actingAs} <b>{me.label}</b>
      </span>
    </a>
  );
}

/** The "מי אתם?" screen, returning to `next` afterwards. */
export const whoUrl = (group: string, next?: string) =>
  next ? `/g/${group}/who?next=${encodeURIComponent(next)}` : `/g/${group}/who`;
