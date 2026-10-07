import { Header } from "../components/Header.tsx";
import { he } from "../i18n/he.ts";

/** Shown in place of any screen of a group that was deleted (live, or found gone). */
export function GroupGone() {
  return (
    <>
      <Header title={he.groupGone.title} />
      <main id="main" class="content">
        <p>{he.groupGone.body}</p>
        <a class="btn big" href="/">
          {he.groupGone.home}
        </a>
      </main>
    </>
  );
}
