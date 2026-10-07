import type { ComponentChildren } from "preact";
import { LocationProvider, Route, Router, useLocation } from "preact-iso";
import { useLayoutEffect } from "preact/hooks";
import type { Leg } from "../shared/types.ts";
import { he } from "./i18n/he.ts";
import { useIdentity, whoUrl } from "./components/Header.tsx";
import { ToastHost } from "./components/Toast.tsx";
import { isBrowsing } from "./identity.ts";
import { FeedbackHost } from "./feedback/Feedback.tsx";
import { useHistoryEffects } from "./nav.ts";
import { Board } from "./screens/Board.tsx";
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
import { Settings } from "./screens/Settings.tsx";
import { Who } from "./screens/Who.tsx";

type P = { params: Record<string, string> };
const p = (x: P, k: string) => x.params[k] ?? "";

/**
 * Group screens need to know who you are: without a family for this group on this phone (and
 * without "רק להסתכל" in this tab) they send you to "מי אתם?", which returns here afterwards.
 */
function NeedsFamily({ group, children }: { group: string; children: ComponentChildren }) {
  const me = useIdentity(group);
  const { route } = useLocation();
  const ok = !!me || isBrowsing(group);
  useLayoutEffect(() => {
    // A redirect, not a navigation: replace so back doesn't bounce into it again.
    if (!ok) route(whoUrl(group, location.pathname + location.search), true);
  }, [ok, group]);
  return ok ? <>{children}</> : null;
}

const guarded = (render: (x: P) => ComponentChildren) => (x: P) => <NeedsFamily group={p(x, "group")}>{render(x)}</NeedsFamily>;

/** Old kid links (`/kid/:group/:token`) → `/g/:group/kid/:token` (the API still accepts old tokens). */
function LegacyKid(x: P) {
  const { route } = useLocation();
  useLayoutEffect(() => route(`/g/${p(x, "group")}/kid/${p(x, "token")}`, true), []);
  return null;
}

const routes = {
  home: () => <Home />,
  newGroup: () => <NewGroup />,
  join: (x: P) => <Join group={p(x, "group")} />,
  who: (x: P) => <Who group={p(x, "group")} />,
  group: guarded((x) => <GroupHome group={p(x, "group")} />),
  newEvent: guarded((x) => <NewEvent group={p(x, "group")} />),
  event: guarded((x) => <EventPage group={p(x, "group")} event={p(x, "event")} />),
  out: guarded((x) => <Board group={p(x, "group")} event={p(x, "event")} leg="out" />),
  back: guarded((x) => <Board group={p(x, "group")} event={p(x, "event")} leg="back" />),
  invite: guarded((x) => <Invite group={p(x, "group")} event={p(x, "event")} />),
  drive: guarded((x) => <Drive group={p(x, "group")} event={p(x, "event")} leg={p(x, "leg") as Leg} />),
  me: guarded((x) => <Profile group={p(x, "group")} />),
  settings: guarded((x) => <Settings group={p(x, "group")} />),
  kid: (x: P) => <Kid group={p(x, "group")} kidId={p(x, "kidId")} />,
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
        <Route path="/g/:group/who" component={routes.who} />
        <Route path="/g/:group/new" component={routes.newEvent} />
        <Route path="/g/:group/me" component={routes.me} />
        <Route path="/g/:group/settings" component={routes.settings} />
        <Route path="/g/:group/kid/:kidId" component={routes.kid} />
        <Route path="/g/:group/e/:event" component={routes.event} />
        <Route path="/g/:group/e/:event/out" component={routes.out} />
        <Route path="/g/:group/e/:event/back" component={routes.back} />
        <Route path="/g/:group/e/:event/invite" component={routes.invite} />
        <Route path="/g/:group/e/:event/drive/:leg" component={routes.drive} />
        <Route path="/kid/:group/:token" component={LegacyKid} />
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
