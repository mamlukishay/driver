/**
 * The app mark: a stubby yellow kid-shuttle whose roof "taxi" sign is a heart (the parents' unpaid taxi
 * service), the sign leaning back in the wind. Facing left = the RTL reading direction.
 * Colors come from theme tokens so it reads in light and dark; the windows are holes, and the wheels get a
 * thin background-colored ring (`--logo-gap`, default the app background) to separate them from the body.
 * Same geometry as public/favicon.svg (which puts it on a fixed asphalt tile).
 */
export function Logo({ size = 28, class: cls }: { size?: number; class?: string }) {
  const ink = "var(--ink)";
  const gap = "var(--logo-gap, var(--app-bg))";
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g transform="rotate(8 18.2 13.2)">
        <rect x="16.4" y="11.2" width="3.6" height="2.4" rx=".6" style={{ fill: ink }} />
        <path style={{ fill: "var(--car-red)" }} d={HEART} />
      </g>
      <path style={{ fill: "var(--accent)" }} fill-rule="evenodd" d={BODY} />
      {WHEELS.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="26" r="3.2" style={{ fill: ink, stroke: gap }} stroke-width="1.3" paint-order="stroke" />
          <circle cx={cx} cy="26" r="1.1" style={{ fill: gap }} />
        </g>
      ))}
    </svg>
  );
}

const WHEELS = [9, 21.5];
const HEART =
  "M18.2 10.88C17.66 10.34 13.7 8 13.7 5.3C13.7 3.68 14.96 2.6 16.4 2.6C17.3 2.6 17.93 3.14 18.2 3.86C18.47 3.14 19.1 2.6 20 2.6C21.44 2.6 22.7 3.68 22.7 5.3C22.7 8 18.74 10.34 18.2 10.88Z";
// Body outline plus the two side windows (cut out with evenodd).
const BODY =
  "M3 25V20.6C3 19.3 3.9 18.3 5.2 18.1L9 17.5 11.9 14.2C12.5 13.6 13.3 13.2 14.2 13.2H22.4C23.9 13.2 25.2 14.2 25.6 15.7L26.6 19.3C26.8 19.9 27 20.6 27 21.3V25C27 25.6 26.6 26 26 26H4C3.4 26 3 25.6 3 25Z" +
  "M11.4 17.4 13.3 15.2C13.6 14.9 14 14.7 14.4 14.7H18.2V17.4Z" +
  "M19.8 14.7H22.4C23.1 14.7 23.7 15.2 23.9 15.9L24.3 17.4H19.8Z";
