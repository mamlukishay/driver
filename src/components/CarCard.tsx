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

/** Steering wheel, drawn in the current text color (driver mode). */
export function SteeringGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M3.4 10.5c3 .9 5.6 1.2 8.6 1.2s5.6-.3 8.6-1.2M12 14.2V21" />
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
  /** Who drives this car ("דני · משפחת כהן"); omitted → the family label alone. */
  driverName?: string | undefined;
  color: number;
  mine: boolean;
  kids: SeatKid[];
  /** A kid is selected and could go here: empty seats look armed. */
  armed?: boolean;
  onEmptySeat: () => void;
  onKid: (kidId: string) => void;
  /** My own car: link to driver mode, shown as the card's main action. */
  driveHref?: string | undefined;
  /** My own car: "עריכה", a small secondary control next to the driver-mode button. */
  onEdit?: (() => void) | undefined;
  /** The event's time changed since this departure time was set ("בדקו שעת יציאה"). */
  departCheck?: boolean;
  /** The owner's "אישור שעה" (shown with `departCheck`). */
  onConfirmDepart?: (() => void) | undefined;
}

export function CarCard({ group, offer, car, familyLabel, driverName, color, mine, kids, armed, onEmptySeat, onKid, driveHref, onEdit, departCheck, onConfirmDepart }: Props) {
  const empty = Math.max(0, offer.seats - kids.length);
  return (
    <article class={cx("car", mine && "me")} style={{ "--fc": famColor(color) }}>
      <div class="car-h">
        {car ? <CarPic group={group} car={car} color={color} /> : <CarGlyph color={color} />}
        <div class="grow1">
          <div class="row">
            <b>{driverName ? `${driverName} · ${familyLabel}` : familyLabel}</b>
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
      {(driveHref || onEdit) && (
        <div class="car-go">
          {driveHref && (
            <a class="btn drive-go" href={driveHref}>
              <SteeringGlyph />
              <span class="drive-go-t">
                <b>{he.event.driveMode}</b>
                <small>{he.event.driveModeSub}</small>
              </span>
              <span class="drive-go-ch" aria-hidden="true">
                ‹
              </span>
            </a>
          )}
          {onEdit && (
            <button type="button" class="mini" onClick={onEdit}>
              {he.common.edit}
            </button>
          )}
        </div>
      )}
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
