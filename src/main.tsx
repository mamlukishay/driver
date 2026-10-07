import { render } from "preact";
import { App } from "./app.tsx";
import { initHistory } from "./nav.ts";
import "./styles/tokens.css";
import "./styles/app.css";

initHistory();
render(<App />, document.getElementById("app")!);
