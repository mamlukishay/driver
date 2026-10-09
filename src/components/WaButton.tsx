import type { ComponentChildren } from "preact";
import { waChooserUrl, waPersonUrl } from "../../shared/whatsapp.ts";

/** A real link to wa.me: to one person when `phone` is given and valid, otherwise the chat chooser. */
export function WaButton({
  phone,
  text,
  class: cls = "btn wa",
  children,
  label,
  onClick,
}: {
  phone?: string;
  text: string;
  class?: string;
  children: ComponentChildren;
  label?: string;
  onClick?: () => void;
}) {
  const href = (phone && waPersonUrl(phone, text)) || waChooserUrl(text);
  return (
    <a class={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} onClick={onClick}>
      <WaIcon />
      <span>{children}</span>
    </a>
  );
}

export function WaIcon({ size = 18 }: { size?: number } = {}) {
  return (
    <svg class="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.5-.3z"
      />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg class="ic" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.2 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.6 3.6 1 1 0 01-.3 1z"
      />
    </svg>
  );
}
