// Usage: bun scripts/api-smoke.ts http://localhost:5180
// Identity is just `X-Family-Id` (no secret): the server only checks the family exists in the group.
import type { EventView, FamilyPrivate, GroupResponse, KidView, ConfigResponse } from "../shared/types.ts";

const base = (process.argv[2] ?? "http://localhost:5180").replace(/\/$/, "");
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, extra === undefined ? "" : JSON.stringify(extra));
  }
}

async function call<T = any>(method: string, path: string, opts: { key?: string; body?: unknown; raw?: BodyInit; type?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.key) headers["X-Family-Id"] = opts.key;
  let body: BodyInit | undefined;
  if (opts.raw !== undefined) {
    body = opts.raw;
    headers["Content-Type"] = opts.type ?? "application/octet-stream";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(base + path, { method, headers, body });
  const ct = res.headers.get("content-type") ?? "";
  const data = (ct.includes("json") ? await res.json() : await res.arrayBuffer()) as T;
  return { status: res.status, data, res };
}

const day = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

const familyInput = (surname: string, phone: string, kid?: string, seats = 4) => ({
  name: surname,
  parents: [{ name: `הורה ${surname}`, phone }],
  address: `רחוב ${surname} 1, תל אביב`,
  kids: kid ? [{ name: kid, phone: "052-3330000" }] : [],
  cars: kid ? [{ label: `רכב ${surname}`, seats, color: "לבן", plate: "123" }] : [],
});

async function register(g: string, surname: string, phone: string, kid?: string) {
  const r = await call<{ familyId: string }>("POST", `/api/g/${g}/families`, { body: familyInput(surname, phone, kid) });
  check(`register ${surname}`, r.status === 200 && !!r.data.familyId && Object.keys(r.data).join() === "familyId", r.data);
  const me = await call<GroupResponse>("GET", `/api/g/${g}`, { key: r.data.familyId });
  return { id: r.data.familyId, key: r.data.familyId, me: me.data.me as FamilyPrivate };
}

async function main() {
  console.log(`API smoke against ${base}`);

  const cfg = await call<ConfigResponse>("GET", "/api/config");
  check("config has features", cfg.status === 200 && typeof cfg.data.features.inviteParse === "boolean", cfg.data);

  const bad = await call("POST", "/api/groups", { body: {} });
  check("create group invalid name -> 400", bad.status === 400 && (bad.data as any).error === "invalid", bad.data);
  const slug = `smoke-${Math.random().toString(36).slice(2, 8)}`;
  check("create group bad slug -> 400", (await call("POST", "/api/groups", { body: { name: "x", slug: "Bad Slug" } })).status === 400);
  check("create group short slug -> 400", (await call("POST", "/api/groups", { body: { name: "x", slug: "ab" } })).status === 400);
  const gr = await call<{ groupId: string }>("POST", "/api/groups", { body: { name: "כיתה ג׳2", slug } });
  check("create group with slug", gr.status === 200 && gr.data.groupId === slug, gr.data);
  const g = gr.data.groupId;
  const dupe = await call("POST", "/api/groups", { body: { name: "עוד", slug } });
  check("duplicate slug -> 409 slug_taken + suggestion", dupe.status === 409 && (dupe.data as any).error === "slug_taken" && (dupe.data as any).suggestion === `${slug}-2`, dupe.data);
  const legacy = await call<{ groupId: string }>("POST", "/api/groups", { body: { name: "בלי כתובת" } });
  check("create group without slug -> random 10-char slug", legacy.status === 200 && legacy.data.groupId.length === 10 && (await call("GET", `/api/g/${legacy.data.groupId}`)).status === 200, legacy.data);
  check("internal paths are not reachable", (await call("POST", `/api/g/${g}/__init`, { body: { name: "x" } })).status === 404);

  check("unknown group -> 404", (await call("GET", "/api/g/zzzzzzzzzz")).status === 404);
  check("malformed group id -> 404", (await call("GET", "/api/g/NOPE!")).status === 404);

  const A = await register(g, "אברהם", "050-1111111", "נועה");
  const B = await register(g, "ברק", "052-2222222", "דני");
  const C = await register(g, "כהן", "053-3333333", "גל");
  const D = await register(g, "דוד", "054-4444444");
  const kidA = A.me.kids[0]!;
  const kidB = B.me.kids[0]!;
  const carB = B.me.cars[0]!;
  check("family colors round-robin", [A, B, C, D].map((f) => f.me.color).join() === "0,1,2,3", [A, B, C, D].map((f) => f.me.color));
  check("me has no keyHash", !("keyHash" in A.me));

  const grp = await call<GroupResponse>("GET", `/api/g/${g}`);
  check("group GET anonymous: 4 families with phones + addresses, no me", grp.data.families.length === 4 && !grp.data.me && grp.data.families.every((f) => f.parents[0]!.phone.startsWith("+972") && !!f.address), grp.data.families.length);

  // 403s
  check("unknown family id -> 403", (await call("POST", `/api/g/${g}/events`, { key: "zzzzzzzz", body: {} })).status === 403);
  check("garbage family id -> 403", (await call("GET", `/api/g/${g}`, { key: "garbage!" })).status === 403);
  check("no family on write -> 403", (await call("POST", `/api/g/${g}/events`, { body: {} })).status === 403);

  // profile update keeps kid id
  const upd = await call<{ me: FamilyPrivate }>("PUT", `/api/g/${g}/families/me`, {
    key: A.key,
    body: { ...familyInput("אברהם", "050-1111111"), kids: [{ id: kidA.id, name: "נועה א׳", phone: "052-3330000" }], cars: [{ id: A.me.cars[0]!.id, label: "רכב חדש", seats: 4 }] },
  });
  check("PUT families/me keeps kid id", upd.status === 200 && upd.data.me.kids[0]!.id === kidA.id && upd.data.me.cars[0]!.label === "רכב חדש", upd.data);

  // event (hosted by D)
  const evInput = { title: "יום הולדת", date: day, start: "16:00", returnTime: "18:30", place: "פארק", address: "הירקון 1" };
  check("event invalid -> 400", (await call("POST", `/api/g/${g}/events`, { key: D.key, body: { title: "x" } })).status === 400);
  const ev = await call<{ eventId: string }>("POST", `/api/g/${g}/events`, { key: D.key, body: { ...evInput, slugWord: "Birthday" } });
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dayBase = `${months[Number(day.slice(5, 7)) - 1]}-${Number(day.slice(8, 10))}`;
  check("create event -> slug <mon>-<day>-word", ev.status === 200 && ev.data.eventId === `${dayBase}-birthday`, ev.data);
  const e = ev.data.eventId;
  const ev2 = await call<{ eventId: string }>("POST", `/api/g/${g}/events`, { key: D.key, body: { ...evInput, slugWord: "birthday" } });
  check("clashing event slug -> -2", ev2.status === 200 && ev2.data.eventId === `${dayBase}-birthday-2`, ev2.data);
  const ev3 = await call<{ eventId: string }>("POST", `/api/g/${g}/events`, { key: D.key, body: evInput });
  check("event without word -> <mon>-<day>", ev3.status === 200 && ev3.data.eventId === dayBase, ev3.data);
  check("event with non-English word -> 400", (await call("POST", `/api/g/${g}/events`, { key: D.key, body: { ...evInput, slugWord: "יומולדת" } })).status === 400);
  const edited = await call<{ event: EventView }>("POST", `/api/g/${g}/events/${ev3.data.eventId}/actions`, { key: D.key, body: { type: "editEvent", patch: { date: "2027-01-01" } } });
  check("editing the date keeps the slug", edited.status === 200 && edited.data.event.id === dayBase && edited.data.event.date === "2027-01-01", edited.data);
  const actions = `/api/g/${g}/events/${e}/actions`;
  const act = (key: string, body: object) => call<{ event: EventView; logId: string }>("POST", actions, { key, body });

  const list = await call<GroupResponse>("GET", `/api/g/${g}`);
  check("group lists the events", list.data.events.length === 3 && list.data.events.some((x) => x.id === e));

  // plans
  let r = await act(A.key, { type: "setKidPlan", kidId: kidA.id, rsvp: "yes", out: true, back: true });
  check("A sets plan for A's kid", r.status === 200 && r.data.event.kidPlans[kidA.id]?.out === true, r.data);
  r = await act(A.key, { type: "setKidPlan", kidId: kidB.id, rsvp: "yes", out: true, back: true });
  check("A sets plan for B's kid -> 403", r.status === 403, r.data);
  r = await act(B.key, { type: "setKidPlan", kidId: kidB.id, rsvp: "yes", out: true, back: false });
  check("B sets plan for B's kid", r.status === 200);

  // offer
  r = await act(B.key, { type: "offerCar", leg: "out", carId: carB.id, seats: 3, departAt: "15:30" });
  check("B offers car on out", r.status === 200 && r.data.event.offers.out.length === 1, r.data);
  const offerId = r.data.event.offers.out[0]!.id;
  r = await act(A.key, { type: "offerCar", leg: "out", carId: carB.id, seats: 3, departAt: "15:30" });
  check("A offering B's car -> 403", r.status === 403);

  const evBefore = await call<EventView>("GET", `/api/g/${g}/events/${e}`, { key: B.key });
  const phoneOf = (v: EventView, fam: string) => v.families.find((f) => f.id === fam)!.parents[0]!.phone;
  check("everyone sees everyone's phone (even before seating)", phoneOf(evBefore.data, A.id) === "+972501111111");

  // WebSocket
  const wsUrl = base.replace(/^http/, "ws") + `/api/g/${g}/ws`;
  const ws = new WebSocket(wsUrl);
  const messages: any[] = [];
  ws.onmessage = (m) => messages.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("ws error"));
  });
  await Bun.sleep(150);
  check("ws greets with group version", messages[0]?.t === "group", messages);

  // seating
  const stale = await call("POST", actions, { key: A.key, body: { type: "seatKid", offerId, kidId: kidA.id, expectedVersion: 1 } });
  check("stale expectedVersion -> 409 stale", stale.status === 409 && (stale.data as any).error === "stale", stale.data);

  const version = (await call<EventView>("GET", `/api/g/${g}/events/${e}`)).data.version;
  messages.length = 0;
  r = await act(A.key, { type: "seatKid", offerId, kidId: kidA.id, expectedVersion: version });
  check("A seats A's kid into B's car", r.status === 200 && r.data.event.offers.out[0]!.kidIds.includes(kidA.id), r.data);
  const seatLog = r.data.logId;
  await Bun.sleep(300);
  check("ws receives event broadcast", messages.some((m) => m.t === "event" && m.eventId === e && m.version === version + 1), messages);

  r = await act(A.key, { type: "seatKid", offerId, kidId: kidB.id });
  check("A seats B's kid into B's car -> 403", r.status === 403, r.data);

  // undo
  const u = await call<{ event: EventView }>("POST", `/api/g/${g}/events/${e}/undo`, { key: A.key, body: { logId: seatLog } });
  check("undo own seating", u.status === 200 && u.data.event.offers.out[0]!.kidIds.length === 0 && u.data.event.waiting.out.includes(kidA.id), u.data);
  const u2 = await call("POST", `/api/g/${g}/events/${e}/undo`, { key: A.key, body: { logId: seatLog } });
  check("undo twice -> 400", u2.status === 400, u2.data);
  const u3 = await call("POST", `/api/g/${g}/events/${e}/undo`, { key: B.key, body: { logId: seatLog } });
  check("undo someone else's -> 403/400", u3.status === 403 || u3.status === 400, u3.data);

  r = await act(A.key, { type: "seatKid", offerId, kidId: kidA.id });
  check("A re-seats A's kid", r.status === 200);
  r = await act(B.key, { type: "seatKid", offerId, kidId: kidB.id });
  check("B (driver) seats own kid on out -> ok", r.status === 200);
  r = await act(B.key, { type: "updateOffer", offerId, seats: 1 });
  check("seats below seated -> 400", r.status === 400, r.data);

  // visibility: everyone in the group sees everything
  const view = async (key?: string) => (await call<EventView>("GET", `/api/g/${g}/events/${e}`, { key })).data;
  const vB = await view(B.key);
  const vA = await view(A.key);
  const vC = await view(C.key);
  const vAnon = await view();
  check("B sees A's phone, kid phone and address", phoneOf(vB, A.id) === "+972501111111" && vB.families.find((f) => f.id === A.id)!.kids[0]!.phone === "+972523330000" && !!vB.families.find((f) => f.id === A.id)!.address);
  check("A sees B's phone", phoneOf(vA, B.id) === "+972522222222", phoneOf(vA, B.id));
  check("unrelated C sees A's and B's phones and address", phoneOf(vC, A.id) === "+972501111111" && phoneOf(vC, B.id) === "+972522222222" && !!vC.families.find((f) => f.id === A.id)!.address);
  check("anonymous gets the same families", JSON.stringify(vAnon.families) === JSON.stringify(vC.families));
  check("view.me reflects requester", vA.me === A.id && vAnon.me === null);
  check("log tail present without inverse", vA.log.length > 0 && !("inverse" in vA.log[0]!));

  // images
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4, 5, 6, 7, 8]);
  const up = await call<{ imageId: string }>("POST", `/api/g/${g}/images`, { key: A.key, raw: png, type: "image/png" });
  check("image upload", up.status === 200 && !!up.data.imageId, up.data);
  const imgRes = await fetch(`${base}/api/g/${g}/images/${up.data.imageId}`);
  const got = new Uint8Array(await imgRes.arrayBuffer());
  check("image get round-trip + cache headers", imgRes.status === 200 && imgRes.headers.get("content-type") === "image/png" && got.length === png.length && got.every((b, i) => b === png[i]) && (imgRes.headers.get("cache-control") ?? "").includes("immutable"), [imgRes.status, imgRes.headers.get("cache-control")]);
  check("image no auth -> 403", (await call("POST", `/api/g/${g}/images`, { raw: png, type: "image/png" })).status === 403);
  check("image bad mime -> 400", (await call("POST", `/api/g/${g}/images`, { key: A.key, raw: "hello", type: "text/plain" })).status === 400);
  const big = await call("POST", `/api/g/${g}/images`, { key: A.key, raw: new Uint8Array(401 * 1024), type: "image/jpeg" });
  check("image too large -> 413", big.status === 413 && (big.data as any).error === "too_large", big.status);
  check("missing image -> 404", (await call("GET", `/api/g/${g}/images/aaaaaaaaaaaaaaaaaaaa`)).status === 404);

  // optional add-ons
  if (!cfg.data.features.inviteParse) {
    const p = await call("POST", `/api/g/${g}/invite/parse`, { key: A.key, body: { imageId: up.data.imageId } });
    check("invite parse off -> 501", p.status === 501 && (p.data as any).error === "feature_off", p.data);
  }
  if (!cfg.data.features.places) {
    const p = await call("GET", `/api/g/${g}/places?q=${encodeURIComponent("תל אביב")}`, { key: A.key });
    check("places off -> 501", p.status === 501 && (p.data as any).error === "feature_off", p.data);
  }

  // kid view + ready
  const kv = await call<KidView>("GET", `/api/g/${g}/kid/${kidA.id}`);
  const ride = kv.data.events?.[0]?.legs.out.ride;
  check("kid view shows ride in B's car", kv.status === 200 && kv.data.kid.name === "נועה א׳" && ride?.driver.familyId === B.id && ride.ready === false, kv.data);
  messages.length = 0;
  const rd = await call("POST", `/api/g/${g}/kid/${kidA.id}/ready`);
  check("kid ready -> ok", rd.status === 200 && (rd.data as any).ok === true, rd.data);
  const kv2 = await call<KidView>("GET", `/api/g/${g}/kid/${kidA.id}`);
  check("kid view ready=true", kv2.data.events[0]!.legs.out.ride?.ready === true);
  await Bun.sleep(300);
  check("ws receives broadcast for kid ready", messages.some((m) => m.t === "event" && m.eventId === e), messages);
  check("unknown kid id -> 404", (await call("GET", `/api/g/${g}/kid/aaaaaaaa`)).status === 404);
  const kidC = C.me.kids[0]!;
  check("kid not seated -> ready 404", (await call("POST", `/api/g/${g}/kid/${kidC.id}/ready`)).status === 404);

  // per-event kid view + live ride fields
  const kve = await call<KidView>("GET", `/api/g/${g}/kid/${kidA.id}?event=${e}`);
  check("kid view ?event= -> only that event", kve.status === 200 && kve.data.events.length === 1 && kve.data.events[0]!.id === e, kve.data);
  check("kid view ?event= past event is still shown", (await call<KidView>("GET", `/api/g/${g}/kid/${kidA.id}?event=${ev3.data.eventId}`)).data.events[0]?.id === ev3.data.eventId);
  check("kid view unknown event -> 404", (await call("GET", `/api/g/${g}/kid/${kidA.id}?event=nope-nope`)).status === 404);
  check("kid view bad event slug -> 404", (await call("GET", `/api/g/${g}/kid/${kidA.id}?event=BAD!`)).status === 404);
  check("kid ready with event -> ok", (await call("POST", `/api/g/${g}/kid/${kidA.id}/ready`, { body: { ready: true, event: e } })).status === 200);
  check("kid ready with event without a ride -> 404", (await call("POST", `/api/g/${g}/kid/${kidA.id}/ready`, { body: { event: ev3.data.eventId } })).status === 404);
  r = await act(B.key, { type: "startRun", offerId });
  check("B starts the run", r.status === 200, r.data);
  r = await act(A.key, { type: "setArrived", offerId, kidId: kidA.id, arrived: true });
  check("setArrived by non-owner -> 403", r.status === 403, r.data);
  r = await act(B.key, { type: "setArrived", offerId, kidId: kidA.id, arrived: true });
  check("B setArrived for A's kid", r.status === 200 && r.data.event.offers.out[0]!.run?.arrived?.includes(kidA.id) === true, r.data);
  const kva = (await call<KidView>("GET", `/api/g/${g}/kid/${kidA.id}?event=${e}`)).data.events[0]!.legs.out.ride;
  const kvb = (await call<KidView>("GET", `/api/g/${g}/kid/${kidB.id}?event=${e}`)).data.events[0]!.legs.out.ride;
  check("kid view: arrived + ahead follow pickup order", kva?.started === true && kva.arrived === true && kva.ahead === 0 && kvb?.arrived === false && kvb.ahead === 1, [kva, kvb]);
  r = await act(B.key, { type: "setPicked", offerId, kidId: kidA.id, picked: true });
  check("picking clears arrived", r.status === 200 && !r.data.event.offers.out[0]!.run?.arrived && r.data.event.offers.out[0]!.run!.picked.includes(kidA.id), r.data);
  const kvb2 = (await call<KidView>("GET", `/api/g/${g}/kid/${kidB.id}?event=${e}`)).data.events[0]!.legs.out.ride;
  check("next kid now has nobody ahead", kvb2?.ahead === 0, kvb2);

  // group settings: PATCH { name?, whatsappUrl? }
  const waCode = "AbCdEf1234567890";
  check("patch group without family -> 403", (await call("PATCH", `/api/g/${g}`, { body: { name: "x" } })).status === 403);
  check("patch group empty -> 400", (await call("PATCH", `/api/g/${g}`, { key: A.key, body: {} })).status === 400);
  check("patch group bad whatsappUrl -> 400", (await call("PATCH", `/api/g/${g}`, { key: A.key, body: { whatsappUrl: "https://wa.me/123" } })).status === 400);
  messages.length = 0;
  const pa = await call<{ group: GroupResponse["group"] }>("PATCH", `/api/g/${g}`, { key: A.key, body: { name: "קבוצה חדשה", whatsappUrl: `chat.whatsapp.com/${waCode}?mode=x` } });
  check("patch group normalizes whatsappUrl", pa.status === 200 && pa.data.group.whatsappUrl === `https://chat.whatsapp.com/${waCode}` && pa.data.group.name === "קבוצה חדשה", pa.data);
  await Bun.sleep(300);
  check("ws receives group broadcast for patch", messages.some((m) => m.t === "group"), messages);
  const pc = await call<{ group: GroupResponse["group"] }>("PATCH", `/api/g/${g}`, { key: A.key, body: { whatsappUrl: "" } });
  check("patch group clears whatsappUrl", pc.status === 200 && pc.data.group.whatsappUrl === undefined, pc.data);

  // create with whatsappUrl
  const waSlug = `smoke-wa-${Date.now().toString(36)}`;
  check("create group bad whatsappUrl -> 400", (await call("POST", "/api/groups", { body: { name: "וואטסאפ", slug: waSlug, whatsappUrl: "nope" } })).status === 400);
  check("create group with whatsappUrl", (await call("POST", "/api/groups", { body: { name: "וואטסאפ", slug: waSlug, whatsappUrl: `https://chat.whatsapp.com/${waCode}` } })).status === 200);
  check("group meta has whatsappUrl", (await call<GroupResponse>("GET", `/api/g/${waSlug}`)).data.group.whatsappUrl === `https://chat.whatsapp.com/${waCode}`);

  // DELETE the group: broadcast, images and storage gone, slug free again
  check("delete group without family -> 403", (await call("DELETE", `/api/g/${g}`)).status === 403);
  messages.length = 0;
  const del = await call("DELETE", `/api/g/${g}`, { key: B.key });
  check("delete group -> ok", del.status === 200 && (del.data as any).ok === true, del.data);
  await Bun.sleep(300);
  check("ws receives deleted", messages.some((m) => m.t === "deleted"), messages);
  const gone = await call("GET", `/api/g/${g}`);
  check("deleted group -> 404 not_found", gone.status === 404 && (gone.data as any).error === "not_found", gone.data);
  check("deleted group image -> 404", (await fetch(`${base}/api/g/${g}/images/${up.data.imageId}`)).status === 404);
  check("deleted group events -> 404", (await call("GET", `/api/g/${g}/events/${e}`)).status === 404);
  check("deleted group with a stale family id -> 404", (await call("GET", `/api/g/${g}`, { key: B.key })).status === 404);
  check("delete again -> 404", (await call("DELETE", `/api/g/${g}`, { key: B.key })).status === 404);
  const again = await call<{ groupId: string }>("POST", "/api/groups", { body: { name: "שוב", slug: g } });
  check("deleted slug can be created again", again.status === 200 && again.data.groupId === g, again.data);
  const fresh = await call<GroupResponse>("GET", `/api/g/${g}`);
  check("re-created group is empty", fresh.status === 200 && fresh.data.families.length === 0 && fresh.data.events.length === 0 && fresh.data.group.name === "שוב", fresh.data);

  ws.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
