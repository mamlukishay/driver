/**
 * Normalizes an Israeli mobile number to `+9725XXXXXXXX`, or null if it isn't one.
 * Accepts `050-1234567`, `0501234567`, `+972501234567`, `972-50-123-4567`, `00972…`, `+972 050…`.
 */
export function normalizePhone(input: string): string | null {
  let d = input.trim();
  const plus = d.startsWith("+");
  d = d.replace(/[\s\-().]/g, "");
  if (plus) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("00972")) d = d.slice(2);
  if (d.startsWith("972")) {
    d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
  } else if (plus) {
    return null;
  } else if (d.startsWith("0")) {
    d = d.slice(1);
  } else {
    return null;
  }
  return /^5\d{8}$/.test(d) ? `+972${d}` : null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** `9725XXXXXXXX`, the form wa.me expects. */
export function waNumber(input: string): string | null {
  return normalizePhone(input)?.slice(1) ?? null;
}

/** `050-123-4567` for display. */
export function formatPhoneLocal(input: string): string | null {
  const n = normalizePhone(input);
  if (!n) return null;
  const local = `0${n.slice(4)}`;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

export function telHref(input: string): string | null {
  const n = normalizePhone(input);
  return n ? `tel:${n}` : null;
}
