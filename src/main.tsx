import { render } from "preact";
import { App } from "./app.tsx";
import { initAccount } from "./account.ts";
import { initHistory } from "./nav.ts";
import "./styles/tokens.css";
import "./styles/app.css";

initHistory();
initAccount();
render(<App />, document.getElementById("app")!);
