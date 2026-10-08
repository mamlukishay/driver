import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { he } from "../i18n/he.ts";
import type { FamilyPublic, GroupResponse } from "../../shared/types.ts";
import { getIdentity, onIdentityChange, touchGroup } from "../identity.ts";
import { useBack, useSheet } from "../nav.ts";
import { api } from "../api.ts";
import { keys, useResource } from "../store.ts";
import { famColor, famLabel, useForce } from "../util.ts";
import { GearIcon, MenuIcon } from "./icons.tsx";
import { Logo } from "./Logo.tsx";
import { NAV_SHEET, NavSheet } from "./NavSheet.tsx";

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
  /** The group's display name; undefined while loading. */
  groupName: string | undefined;
}

/** The family this device acts as, with its display label (loads the group, cached). */
export function useMe(group: string | undefined): Me | null {
  const familyId = useIdentity(group);
  // Same cache entry as useGroup(group); no fetch when there is no group or no family.
  const res = useResource<GroupResponse>(group && familyId ? keys.group(group) : null, () => api.getGroup(group!));
  if (!group || !familyId) return null;
  const families = res.data?.families ?? [];
  const family = families.find((f) => f.id === familyId);
  return { familyId, family, label: family ? famLabel(family, families) : "…", groupName: res.data?.group.name };
}

/** The group's display name from the shared cache (loads it if needed; never blocks rendering). */
export function useGroupName(group: string | undefined): string | undefined {
  const res = useResource<GroupResponse>(group ? keys.group(group) : null, () => api.getGroup(group!));
  return res.data?.group.name;
}

interface Props {
  title: string;
  /** Parent screen: the back arrow always goes up to it (see useBack). Omit on root screens. */
  up?: string;
  group?: string;
  /** Hide the identity chip (home, kid page). */
  noChip?: boolean;
  /** A small muted group-name line above the title, linking to the group home (group-scoped screens). */
  groupLine?: boolean;
  /** A small muted line under the title saying what the screen is (settings: "הגדרות הקבוצה", with a gear). */
  sub?: string;
  /** The title is the group's name: the identity chip drops its "· group" suffix (group home, settings). */
  titleIsGroup?: boolean;
  children?: ComponentChildren;
}

/** The screen header: back arrow (or the app mark), title, the ☰ menu (`?sheet=nav`) and the identity chip. */
export function Header({ title, up, group, noChip, groupLine, sub, titleIsGroup, children }: Props) {
  const back = useBack(up ?? "/");
  const sheet = useSheet();
  useEffect(() => {
    if (group) touchGroup(group);
  }, [group]);
  return (
    <>
      <header class="hdr">
        <div class="hdr-row">
          {up !== undefined ? (
            <button type="button" class="bk" onClick={back} aria-label={he.common.back}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          ) : (
            <Logo class="brand" size={30} />
          )}
          {(groupLine && group) || sub ? (
            <div class="attl-w">
              {groupLine && group && <GroupLine group={group} />}
              <h1 class="attl">{title}</h1>
              {sub && (
                <p class="hdr-sub">
                  <GearIcon size={14} />
                  {sub}
                </p>
              )}
            </div>
          ) : (
            <h1 class="attl">{title}</h1>
          )}
          {children}
          <button
            type="button"
            class="menu-btn"
            onClick={() => sheet.open(NAV_SHEET)}
            aria-label={he.nav.menu}
            title={he.nav.menu}
            aria-haspopup="dialog"
            aria-expanded={sheet.name === NAV_SHEET}
          >
            <MenuIcon size={22} />
          </button>
        </div>
        {group && !noChip && <IdentityChip group={group} noGroupName={titleIsGroup} />}
      </header>
      <NavSheet group={group} />
    </>
  );
}

function GroupLine({ group }: { group: string }) {
  const name = useGroupName(group);
  return name ? (
    <a class="hdr-grp" href={`/g/${group}`}>
      {name}
    </a>
  ) : null;
}

function IdentityChip({ group, noGroupName }: { group: string; noGroupName?: boolean }) {
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
    <a class="who" href={`/g/${group}/me`} title={he.identity.chipHint} style={{ "--fc": famColor(me.family?.color ?? 0) }}>
      <span class="fdot" aria-hidden="true" />
      <span>
        {he.identity.actingAs} <b>{me.label}</b>
        {me.groupName && !noGroupName && <span class="who-grp"> · {me.groupName}</span>}
      </span>
    </a>
  );
}

/** The "מי אתם?" screen, returning to `next` afterwards. */
export const whoUrl = (group: string, next?: string) =>
  next ? `/g/${group}/who?next=${encodeURIComponent(next)}` : `/g/${group}/who`;
