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
