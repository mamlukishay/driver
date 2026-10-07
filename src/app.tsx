import { LocationProvider, Route, Router } from "preact-iso";
import type { Leg } from "../shared/types.ts";
import { he } from "./i18n/he.ts";
import { ToastHost } from "./components/Toast.tsx";
import { FeedbackHost } from "./feedback/Feedback.tsx";
import { useHistoryEffects } from "./nav.ts";
import { Board } from "./screens/Board.tsx";
import { Devices } from "./screens/Devices.tsx";
import { Drive } from "./screens/Drive.tsx";
import { EventPage } from "./screens/EventPage.tsx";
import { GroupHome } from "./screens/GroupHome.tsx";
import { Home } from "./screens/Home.tsx";
import { Invite } from "./screens/Invite.tsx";
import { Join } from "./screens/Join.tsx";
import { Kid } from "./screens/Kid.tsx";
import { NewEvent } from "./screens/NewEvent.tsx";
import { NewGroup } from "./screens/NewGroup.tsx";
import { NotFound } from "./screens/NotFound.tsx";
import { Profile } from "./screens/Profile.tsx";

type P = { params: Record<string, string> };
const p = (x: P, k: string) => x.params[k] ?? "";

const routes = {
  home: () => <Home />,
  newGroup: () => <NewGroup />,
  join: (x: P) => <Join group={p(x, "group")} />,
  group: (x: P) => <GroupHome group={p(x, "group")} />,
  newEvent: (x: P) => <NewEvent group={p(x, "group")} />,
  event: (x: P) => <EventPage group={p(x, "group")} event={p(x, "event")} />,
  out: (x: P) => <Board group={p(x, "group")} event={p(x, "event")} leg="out" />,
  back: (x: P) => <Board group={p(x, "group")} event={p(x, "event")} leg="back" />,
  invite: (x: P) => <Invite group={p(x, "group")} event={p(x, "event")} />,
  drive: (x: P) => <Drive group={p(x, "group")} event={p(x, "event")} leg={p(x, "leg") as Leg} />,
  me: (x: P) => <Profile group={p(x, "group")} />,
  devices: (x: P) => <Devices group={p(x, "group")} />,
  kid: (x: P) => <Kid group={p(x, "group")} token={p(x, "kidToken")} />,
};

function Shell() {
  useHistoryEffects();
  return (
    <>
      <a class="skip" href="#main">
        {he.common.skip}
      </a>
      <Router>
        <Route path="/" component={routes.home} />
        <Route path="/new-group" component={routes.newGroup} />
        <Route path="/join/:group" component={routes.join} />
        <Route path="/g/:group" component={routes.group} />
        <Route path="/g/:group/new" component={routes.newEvent} />
        <Route path="/g/:group/me" component={routes.me} />
        <Route path="/g/:group/devices" component={routes.devices} />
        <Route path="/g/:group/e/:event" component={routes.event} />
        <Route path="/g/:group/e/:event/out" component={routes.out} />
        <Route path="/g/:group/e/:event/back" component={routes.back} />
        <Route path="/g/:group/e/:event/invite" component={routes.invite} />
        <Route path="/g/:group/e/:event/drive/:leg" component={routes.drive} />
        <Route path="/kid/:group/:kidToken" component={routes.kid} />
        <Route default component={NotFound} />
      </Router>
      <ToastHost />
      <FeedbackHost />
    </>
  );
}

export function App() {
  return (
    <LocationProvider>
      <Shell />
    </LocationProvider>
  );
}
