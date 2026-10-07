import { Header } from "../components/Header.tsx";
import { he } from "../i18n/he.ts";

export function NotFound() {
  return (
    <>
      <Header title={he.notFound.title} up="/" />
      <main id="main" class="content">
        <p>{he.notFound.body}</p>
        <a class="btn big" href="/">
          {he.notFound.home}
        </a>
      </main>
    </>
  );
}
