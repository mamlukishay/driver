/** Stroked UI icons in the current text color (header and the ☰ menu). */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.8",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

export function GearIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...stroke}
        d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zm7.4-3.2c0-.5 0-.9-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.9 7.9 0 000 2.6l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.3z"
      />
    </svg>
  );
}

/** ☰ */
export function MenuIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...stroke} stroke-width="2.2" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CalendarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...stroke} d="M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1zM4 10.5h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

export function PeopleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...stroke}
        d="M9 11a3.2 3.2 0 100-6.4A3.2 3.2 0 009 11zM3 19.5c.6-3.3 3-5.3 6-5.3s5.4 2 6 5.3M16 11.2a2.8 2.8 0 100-5.6M17.2 14.4c2 .5 3.4 2.3 3.8 5.1"
      />
    </svg>
  );
}

export function CarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...stroke}
        d="M5 11.5l1.6-4.3a2 2 0 011.9-1.3h7a2 2 0 011.9 1.3l1.6 4.3M4.5 11.5h15a1 1 0 011 1V17h-17v-4.5a1 1 0 011-1zM6.5 17v1.5M17.5 17v1.5"
      />
      <circle cx="7.5" cy="14.2" r=".9" fill="currentColor" />
      <circle cx="16.5" cy="14.2" r=".9" fill="currentColor" />
    </svg>
  );
}

export function GroupsIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...stroke} d="M4 5h6.5v6.5H4zM13.5 5H20v6.5h-6.5zM4 14.5h6.5V21H4zM13.5 14.5H20V21h-6.5z" />
    </svg>
  );
}

export function PlusIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path {...stroke} stroke-width="2.2" d="M12 5v14M5 12h14" />
    </svg>
  );
}
