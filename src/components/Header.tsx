import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { he } from "../i18n/he.ts";
import { getIdentity, onIdentityChange, type Identity } from "../identity.ts";
import { useBack } from "../nav.ts";
import { famColor } from "../util.ts";
import { useForce } from "../util.ts";

export function useIdentity(group: string | undefined): Identity | null {
  const force = useForce();
  useEffect(() => { const off = onIdentityChange(force); return () => void off(); }, []);
  return group ? getIdentity(group) : null;
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
  const me = useIdentity(group);
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
      </div>
      {group && !noChip && <IdentityChip group={group} me={me} />}
    </header>
  );
}

function IdentityChip({ group, me }: { group: string; me: Identity | null }) {
  if (!me)
    return (
      <div class="who anon">
        <span>{he.identity.viewOnly}</span>
        <a class="lnk" href={`/join/${group}`}>
          {he.identity.joinCta}
        </a>
      </div>
    );
  return (
    <div class="who" style={{ "--fc": famColor(me.color) }}>
      <span class="fdot" aria-hidden="true" />
      <span>
        {he.identity.actingAs} <b>{he.family(me.familyName)}</b>
      </span>
    </div>
  );
}
