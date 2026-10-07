/** Calendar-date helpers (`yyyy-mm-dd`), in the groups' time zone. Pure. */

export const GROUP_TZ = "Asia/Jerusalem";

/** Past events disappear from the group home this many days after their date (data and links stay). */
export const PAST_VISIBLE_DAYS = 30;

/** `yyyy-mm-dd` of the instant `now` in `tz` (Israel by default). */
export function dateInZone(now: number, tz: string = GROUP_TZ): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: tz });
}

/** `ymd` plus `days` calendar days (negative to go back). */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether an event dated `date` still shows on the group home on `today`: upcoming events always,
 * past ones for `PAST_VISIBLE_DAYS` days after their date.
 */
export function shownOnGroupHome(date: string, today: string, days = PAST_VISIBLE_DAYS): boolean {
  return date >= addDays(today, -days);
}

/** `yyyy-mm-dd` → `dd/mm/yyyy` (Israeli order, independent of the device locale); "" when empty or malformed. */
export function fmtDmy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
