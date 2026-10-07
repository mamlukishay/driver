import { waNumber } from "./phone.ts";

/** Opens a chat with one person, text prefilled. Null when the phone isn't a valid Israeli mobile. */
export function waPersonUrl(phone: string, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Opens WhatsApp's chat chooser (the only way to reach a group), text prefilled. */
export function waChooserUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const WA_GROUP_RE = /^(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/([A-Za-z0-9]{10,40})\/?(?:[?#].*)?$/i;

/**
 * A linked WhatsApp group invite (`https://chat.whatsapp.com/<code>`, code 10–40 letters/digits).
 * Accepts it without `https://` and with WhatsApp's trailing `?…`, and normalizes to the bare https URL.
 * `""` for empty input (clears the link), null when invalid.
 */
export function normalizeWaGroupUrl(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return "";
  const m = WA_GROUP_RE.exec(v);
  return m ? `https://chat.whatsapp.com/${m[1]}` : null;
}
