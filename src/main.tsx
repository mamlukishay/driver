import { render } from "preact";

function App() {
  return (
    <main>
      <h1>טרמפוש</h1>
      <p>בקרוב: הסעות משותפות לאירועים.</p>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
