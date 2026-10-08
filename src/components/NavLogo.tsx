import { useId } from "preact/hooks";
import type { NavApp } from "../navApp.ts";

export const NAV_APP_NAME: Record<NavApp, string> = { waze: "Waze", gmaps: "Google Maps" };

/** Small glyphs that suggest each app (not the real marks): Waze's bubble face, a multicolor map pin. */
export function NavLogo({ app, size = 20 }: { app: NavApp; size?: number }) {
  return <span class="nlogo" data-app={app}>{app === "gmaps" ? <MapsGlyph size={size} /> : <WazeGlyph size={size} />}</span>;
}

function WazeGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.6c4.9 0 8.4 3.2 8.4 7.4 0 3-1.9 5.2-4.5 6.3a3.8 3.8 0 01-7.2.9c-2.8-.6-5.1-2.6-5.7-5.2-.8-.3-1.4-1-1.4-1.8 1.1 0 1.8-.6 2-1.6.6-3.6 4-6 8.4-6z"
        fill="#5AC8F5"
        stroke="#1C1F23"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <circle cx="9.6" cy="10" r="1.25" fill="#1C1F23" />
      <circle cx="14.6" cy="10" r="1.25" fill="#1C1F23" />
      <path d="M9.4 13.1c1.4 1.3 3.9 1.3 5.3 0" fill="none" stroke="#1C1F23" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

function MapsGlyph({ size }: { size: number }) {
  const id = `gm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d="M12 1.8a7.3 7.3 0 00-7.3 7.3c0 5.3 7.3 13.1 7.3 13.1s7.3-7.8 7.3-13.1A7.3 7.3 0 0012 1.8z" />
        </clipPath>
      </defs>
      <g clip-path={`url(#${id})`}>
        <rect width="24" height="24" fill="#34A853" />
        <path d="M0 0h24v9.5H0z" fill="#EA4335" />
        <path d="M12 9.5L24 1v13z" fill="#4285F4" />
        <path d="M12 9.5L0 3v10z" fill="#FBBC04" />
      </g>
      <circle cx="12" cy="9.3" r="2.7" fill="#fff" />
    </svg>
  );
}
