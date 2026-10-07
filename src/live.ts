/** Live updates per group: WebSocket to the group's DO, with backoff and a polling fallback. */
import { useEffect } from "preact/hooks";
import type { WsMessage } from "../shared/types.ts";
import { api } from "./api.ts";
import { activeKeys, keys, peek, refetch } from "./store.ts";

interface Conn {
  refs: number;
  ws: WebSocket | null;
  up: boolean;
  retry: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  pollTimer?: ReturnType<typeof setInterval>;
  pingTimer?: ReturnType<typeof setInterval>;
  closed: boolean;
}

const conns = new Map<string, Conn>();

function refetchAll(group: string) {
  for (const k of activeKeys(group)) void refetch(k);
}

function onMessage(group: string, msg: WsMessage) {
  const active = activeKeys(group);
  if (msg.t === "group") {
    const cur = peek<{ group: { version: number } }>(keys.group(group));
    if (active.includes(keys.group(group)) && cur?.group.version !== msg.version) void refetch(keys.group(group));
    return;
  }
  const ek = keys.event(group, msg.eventId);
  const cur = peek<{ version: number }>(ek);
  if (active.includes(ek) && cur?.version !== msg.version) void refetch(ek);
  // Summaries (gap meters) and kid views depend on event state too.
  if (active.includes(keys.group(group))) void refetch(keys.group(group));
  for (const k of active) if (k.startsWith(`kid:${group}:`)) void refetch(k);
}

function connect(group: string, c: Conn) {
  if (c.closed) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(api.wsUrl(group));
  } catch {
    schedule(group, c);
    return;
  }
  c.ws = ws;
  ws.onopen = () => {
    const wasDown = c.retry > 0;
    c.up = true;
    c.retry = 0;
    stopPoll(c);
    clearInterval(c.pingTimer);
    c.pingTimer = setInterval(() => {
      try {
        ws.send("ping");
      } catch {
        /* closing */
      }
    }, 30_000);
    if (wasDown) refetchAll(group);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string" || ev.data === "pong") return;
    try {
      onMessage(group, JSON.parse(ev.data) as WsMessage);
    } catch {
      /* ignore junk */
    }
  };
  ws.onclose = () => {
    c.up = false;
    c.ws = null;
    clearInterval(c.pingTimer);
    if (c.closed) return;
    startPoll(group, c);
    schedule(group, c);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}

function schedule(group: string, c: Conn) {
  clearTimeout(c.retryTimer);
  const delay = Math.min(30_000, 1000 * 2 ** c.retry) * (0.75 + Math.random() * 0.5);
  c.retry++;
  c.retryTimer = setTimeout(() => connect(group, c), delay);
}

function startPoll(group: string, c: Conn) {
  if (c.pollTimer) return;
  c.pollTimer = setInterval(() => {
    if (!c.up && document.visibilityState === "visible") refetchAll(group);
  }, 30_000);
}
function stopPoll(c: Conn) {
  clearInterval(c.pollTimer);
  c.pollTimer = undefined;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  for (const [group, c] of conns) {
    if (!c.up) {
      refetchAll(group);
      clearTimeout(c.retryTimer);
      c.retry = 0;
      connect(group, c);
    }
  }
});

export function subscribeGroup(group: string): () => void {
  let c = conns.get(group);
  if (!c) {
    c = { refs: 0, ws: null, up: false, retry: 0, closed: false };
    conns.set(group, c);
    connect(group, c);
  }
  c.refs++;
  const conn = c;
  return () => {
    conn.refs--;
    if (conn.refs > 0) return;
    // Keep the socket a moment so screen-to-screen navigation doesn't reconnect.
    setTimeout(() => {
      if (conn.refs > 0) return;
      conn.closed = true;
      clearTimeout(conn.retryTimer);
      clearInterval(conn.pingTimer);
      stopPoll(conn);
      conn.ws?.close();
      conns.delete(group);
    }, 5000);
  };
}

export function useLive(group: string | undefined): void {
  useEffect(() => (group ? subscribeGroup(group) : undefined), [group]);
}
