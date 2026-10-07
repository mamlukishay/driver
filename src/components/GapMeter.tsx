import type { Leg, LegGap } from "../../shared/types.ts";
import { he } from "../i18n/he.ts";
import { WaButton } from "./WaButton.tsx";

export function gapClass(g: LegGap) {
  return g.state === "missing" ? "gap" : g.state === "unassigned" ? "mid" : "ok";
}

/** Full meter for a leg. `askText` adds the "בקש מהקבוצה" WhatsApp button when seats are missing. */
export function GapMeter({ gap, leg, askText }: { gap: LegGap; leg: Leg; askText?: string }) {
  const txt =
    gap.need === 0
      ? he.gap.none(leg)
      : gap.state === "missing"
        ? he.gap.missing(gap.missing, leg)
        : gap.state === "unassigned"
          ? he.gap.unassigned(gap.waiting)
          : he.gap.ok(leg);
  const pct = gap.need ? Math.round((gap.seated / gap.need) * 100) : 100;
  return (
    <div class={`gm ${gap.need === 0 ? "mid" : gapClass(gap)}`}>
      <div class="gm-t">
        <b>{txt}</b>
        {gap.need > 0 && <span class="num">{he.gap.progress(gap.seated, gap.need)}</span>}
      </div>
      <div class="gm-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      {gap.state === "missing" && askText && (
        <WaButton class="mini" text={askText}>
          {he.gap.ask}
        </WaButton>
      )}
    </div>
  );
}

export function MiniGap({ gap, leg }: { gap: LegGap; leg: Leg }) {
  const txt =
    gap.need === 0
      ? he.gap.shortNone(leg)
      : gap.state === "missing"
        ? he.gap.shortMissing(gap.missing, leg)
        : gap.state === "unassigned"
          ? he.gap.shortWaiting(gap.waiting, leg)
          : he.gap.shortOk(leg);
  const pct = gap.need ? Math.round((gap.seated / gap.need) * 100) : 100;
  return (
    <div class={`gm sm ${gap.need === 0 ? "mid" : gapClass(gap)}`}>
      <b>{txt}</b>
      <div class="gm-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
