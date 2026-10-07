import type { ComponentChildren } from "preact";
import type { CarPublic, Offer } from "../../shared/types.ts";
import { api } from "../api.ts";
import { he } from "../i18n/he.ts";
import { cx, famColor, initial } from "../util.ts";

export function CarGlyph({ color, size = 24 }: { color: number; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ color: famColor(color) }}>
      <path
        d="M5 11l1.6-4.2A2 2 0 018.5 5.5h7a2 2 0 011.9 1.3L19 11a2 2 0 011.5 1.9V17a1 1 0 01-1 1H18a1.5 1.5 0 01-3 0H9a1.5 1.5 0 01-3 0H4.5a1 1 0 01-1-1v-4.1A2 2 0 015 11z"
        fill="currentColor"
      />
      <path d="M7.5 11l1-2.6h7l1 2.6z" fill="var(--car-glass)" />
    </svg>
  );
}

/** Car photo thumbnail, or a family-tinted car glyph. `big` for the kid page. */
export function CarPic({ group, car, color, big }: { group: string; car: CarPublic; color: number; big?: boolean }) {
  return (
    <span class={cx(big ? "cbig" : "cth", !car.photoId && "nop")}>
      {car.photoId ? (
        <img src={api.imageUrl(group, car.photoId)} alt={car.label} loading="lazy" />
      ) : (
        <CarGlyph color={color} size={big ? 72 : 26} />
      )}
    </span>
  );
}

export function Plate({ plate }: { plate?: string }) {
  if (!plate) return null;
  return (
    <span class="plate" dir="ltr">
      …{plate}
    </span>
  );
}

export interface SeatKid {
  id: string;
  name: string;
  color: number;
  ready?: boolean;
}

interface Props {
  group: string;
  offer: Offer;
  car: CarPublic | undefined;
  /** Display label ("משפחת X", disambiguated). */
  familyLabel: string;
  color: number;
  mine: boolean;
  kids: SeatKid[];
  /** A kid is selected and could go here: empty seats look armed. */
  armed?: boolean;
  onEmptySeat: () => void;
  onKid: (kidId: string) => void;
  actions?: ComponentChildren;
  /** The event's time changed since this departure time was set ("בדקו שעת יציאה"). */
  departCheck?: boolean;
  /** The owner's "אישור שעה" (shown with `departCheck`). */
  onConfirmDepart?: (() => void) | undefined;
}

export function CarCard({ group, offer, car, familyLabel, color, mine, kids, armed, onEmptySeat, onKid, actions, departCheck, onConfirmDepart }: Props) {
  const empty = Math.max(0, offer.seats - kids.length);
  return (
    <article class={cx("car", mine && "me")} style={{ "--fc": famColor(color) }}>
      <div class="car-h">
        {car ? <CarPic group={group} car={car} color={color} /> : <CarGlyph color={color} />}
        <div class="grow1">
          <div class="row">
            <b>{familyLabel}</b>
            {mine && <span class="tag me">{he.common.mine}</span>}
          </div>
          <small class="muted">
            {car?.label}
            {car?.label ? " · " : ""}
            <time class="num">{he.board.departs(offer.departAt)}</time>
          </small>
        </div>
        <span class="num seatcount" aria-label={`${kids.length} / ${offer.seats}`}>
          {he.board.seatCount(kids.length, offer.seats)}
        </span>
      </div>
      {departCheck && <DepartCheck onConfirm={onConfirmDepart} />}
      <div class="seats">
        {kids.map((k) => (
          <span class="seat-wrap">
            <button
              type="button"
              class="seat full"
              style={{ "--fc": famColor(k.color) }}
              onClick={() => onKid(k.id)}
              aria-label={he.board.seatedKid(k.name)}
            >
              <span class="av" style={{ "--fc": famColor(k.color) }} aria-hidden="true">
                {initial(k.name)}
              </span>
              {k.ready && <span class="rdy" aria-hidden="true">✓</span>}
              <span class="nm">{k.name}</span>
            </button>
          </span>
        ))}
        {Array.from({ length: empty }, () => (
          <span class="seat-wrap">
            <button type="button" class={cx("seat", armed && "arm")} onClick={onEmptySeat} aria-label={he.board.emptySeat(familyLabel)}>
              +
            </button>
          </span>
        ))}
      </div>
      {actions && <div class="row wrap">{actions}</div>}
    </article>
  );
}

/** "בדקו שעת יציאה" with the owner's "אישור שעה" button. */
export function DepartCheck({ onConfirm }: { onConfirm?: (() => void) | undefined }) {
  return (
    <div class="dchk" role="status">
      <b>{he.manage.checkDepart}</b>
      {onConfirm && (
        <button type="button" class="mini" onClick={onConfirm}>
          {he.manage.confirmDepart}
        </button>
      )}
    </div>
  );
}
