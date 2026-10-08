/**
 * The ☰ menu (`?sheet=nav`, opened from the header on every screen with a header): this group's
 * places, my other groups, all groups and a new group. Tapping a row replaces the menu's history
 * entry with the target, so back from there returns to the screen under the menu, not to the menu.
 */
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { he } from "../i18n/he.ts";
import { allIdentities, myGroupsByLastUsed, onIdentityChange } from "../identity.ts";
import { useReplaceLink, useSheet } from "../nav.ts";
import { useGroup } from "../store.ts";
import { famColor, famLabel, useForce } from "../util.ts";
import { useGroupName, useMe } from "./Header.tsx";
import { CalendarIcon, CarIcon, GearIcon, GroupsIcon, PeopleIcon, PlusIcon } from "./icons.tsx";
import { Sheet } from "./Sheet.tsx";

export const NAV_SHEET = "nav";

export function NavSheet({ group }: { group?: string }) {
  const sheet = useSheet();
  const open = sheet.name === NAV_SHEET;
  const name = useGroupName(open ? group : undefined);
  return (
    <Sheet open={open} title={group ? (name ?? he.appName) : he.appName} onClose={sheet.close} slide>
      {open && <NavBody group={group} />}
    </Sheet>
  );
}

function NavBody({ group }: { group?: string }) {
  const force = useForce();
  useEffect(() => {
    const off = onIdentityChange(force);
    return () => void off();
  }, []);
  const me = useMe(group);
  const ids = allIdentities();
  const others = myGroupsByLastUsed().filter((g) => g !== group);
  const g = group ? `/g/${group}` : "";
  return (
    <nav class="navm" aria-label={he.nav.menu}>
      {group && (
        <>
          <p class="navm-me" style={me ? { "--fc": famColor(me.family?.color ?? 0) } : undefined}>
            {me ? (
              <>
                <span class="fdot" aria-hidden="true" />
                {me.label}
              </>
            ) : (
              he.identity.viewOnly
            )}
          </p>
          <h3 class="hs">{he.nav.thisGroup}</h3>
          <ul class="navm-list">
            <NavRow href={g} icon={<CalendarIcon size={22} />} label={he.nav.events} />
            {me && <NavRow href={`${g}/me`} icon={<PeopleIcon size={22} />} label={he.group.myFamily} />}
            {me && <NavRow href={`${g}/me/cars`} icon={<CarIcon size={22} />} label={he.nav.myCars} />}
            <NavRow href={`${g}/settings`} icon={<GearIcon size={22} />} label={he.settings.title} />
          </ul>
        </>
      )}
      <h3 class="hs">{he.home.title}</h3>
      <ul class="navm-list">
        {others.map((o) => (
          <OtherGroupRow key={o} group={o} familyId={ids[o]!} />
        ))}
        <NavRow href="/" icon={<GroupsIcon size={22} />} label={he.nav.allGroups} />
        <NavRow href="/new-group" icon={<PlusIcon size={22} />} label={he.newGroup.title} />
      </ul>
    </nav>
  );
}

function OtherGroupRow({ group, familyId }: { group: string; familyId: string }) {
  const res = useGroup(group);
  const families = res.data?.families ?? [];
  const fam = families.find((f) => f.id === familyId);
  return (
    <NavRow
      href={`/g/${group}`}
      icon={<span class="fdot lg" aria-hidden="true" />}
      style={{ "--fc": famColor(fam?.color ?? 0) }}
      label={res.data?.group.name ?? group}
      sub={fam ? famLabel(fam, families) : "…"}
    />
  );
}

function NavRow({
  href,
  icon,
  label,
  sub,
  style,
}: {
  href: string;
  icon: ComponentChildren;
  label: string;
  sub?: string;
  style?: Record<string, string>;
}) {
  const { path } = useLocation();
  const sheet = useSheet();
  const replace = useReplaceLink();
  const here = path === href;
  const onClick = (e: MouseEvent) => {
    if (here && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation(); // the router would push the same screen again
      sheet.close();
      return;
    }
    replace(e);
  };
  return (
    <li>
      <a class="navm-row" href={href} onClick={onClick} aria-current={here ? "page" : undefined} style={style}>
        <span class="navm-ic">{icon}</span>
        <span class="navm-l">
          <b>{label}</b>
          {sub && <small>{sub}</small>}
        </span>
        <svg class="navm-chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
    </li>
  );
}
