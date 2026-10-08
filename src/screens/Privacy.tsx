import { Header } from "../components/Header.tsx";
import { he } from "../i18n/he.ts";

/** `/privacy`: what optional Google sign-in keeps (linked from the home sign-in card). */
export function Privacy() {
  return (
    <>
      <Header title={he.privacy.title} up="/" />
      <main id="main" class="content privacy">
        {he.privacy.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </main>
    </>
  );
}
