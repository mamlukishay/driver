/** Optional Google sign-in UI (src/account.ts): the Google button, the home card and the signed-in line. */
import { useState } from "preact/hooks";
import { he } from "../i18n/he.ts";
import { signIn, signOut, useAccount } from "../account.ts";
import { toast } from "./Toast.tsx";

/** Google's "G" mark (four colors, per Google's sign-in branding guidelines). */
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** "התחברות עם Google": a full navigation to `/auth/google`, back to `next` afterwards. */
export function GoogleButton({ next }: { next?: string }) {
  return (
    <button type="button" class="gbtn" onClick={() => signIn(next)}>
      <GoogleG />
      <span>{he.account.google}</span>
    </button>
  );
}

/** Signs out (the groups stay on this phone) with a short toast. */
export function useSignOut(): [busy: boolean, run: () => void] {
  const [busy, setBusy] = useState(false);
  const run = () => {
    if (busy) return;
    setBusy(true);
    void signOut().then(() => {
      setBusy(false);
      toast.info(he.account.signedOut);
    });
  };
  return [busy, run];
}

/** Home: the sign-in card when signed out; nothing when accounts are off or not loaded yet. */
export function AccountCard() {
  const acct = useAccount();
  if (!acct.enabled || !acct.loaded || acct.user) return null;
  return (
    <section class="card acct-card" aria-labelledby="acct-h">
      <h2 class="acct-t" id="acct-h">
        {he.account.cardTitle}
      </h2>
      <p class="small muted">{he.account.cardHint}</p>
      <GoogleButton next="/" />
      <a class="lnk quiet small start" href="/privacy">
        {he.account.privacyLink}
      </a>
    </section>
  );
}

/** Home: a quiet "מחובר/ת בתור X · התנתקות" line when signed in. */
export function SignedInLine() {
  const acct = useAccount();
  const [busy, out] = useSignOut();
  if (!acct.enabled || !acct.user) return null;
  return (
    <p class="acct-line small muted">
      <span>
        {he.account.signedInAs} <b>{acct.user.name}</b>
      </span>
      <button type="button" class="lnk quiet" onClick={out} disabled={busy}>
        {he.account.signOut}
      </button>
    </p>
  );
}
