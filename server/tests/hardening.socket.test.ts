import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import {
  EVENTS,
  type Card,
  type ClueRejection,
  type CreateRoomResponse,
  type ErrorPayload,
  type JoinAck,
  type RoomView,
} from "@stemcharades/shared";
import { createApp } from "../src/app.js";
import { tickGames } from "../src/realtime/handlers.js";
import { EXPLAINER_GRACE_MS, HOST_GRACE_MS } from "../src/config.js";
import { REVEAL_MS } from "../src/game/roundEngine.js";

const CARD: Card = {
  id: "phy-0001", type: "term", subject: "Physics", topic: "Zorbology", level: 2, prompt: "Zorblaxium",
  answers: ["zorblaxium"], forbidden: ["alphaword", "betaword", "gammaword"],
  explanation: "Quuxplanation: a deliberately unusual explanation sentence.", status: "reviewed",
};

let url: string;
let app: ReturnType<typeof createApp>;
let now: number;
const sockets: Socket[] = [];

beforeEach(async () => {
  now = 1_000_000;
  app = createApp({ cards: [CARD], clock: () => now, rng: () => 0 });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => void app.io.close(() => r()));
});

const post = (body: unknown) =>
  fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const client = () => {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return s;
};
const join = (s: Socket, payload: object) => new Promise<JoinAck>((resolve) => s.emit(EVENTS.join, payload, resolve));
const state = (s: Socket, pred: (v: RoomView) => boolean) =>
  new Promise<RoomView>((resolve) => {
    const h = (v: RoomView) => {
      if (pred(v)) {
        s.off(EVENTS.state, h);
        resolve(v);
      }
    };
    s.on(EVENTS.state, h);
  });
const once = <T>(s: Socket, ev: string) => new Promise<T>((r) => s.once(ev, r));
const tick = () => tickGames(app.io, app.rooms, app.runner);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function room(names = ["Host", "Ann", "Ben"]) {
  const created = (await (await post({ nickname: names[0] })).json()) as CreateRoomResponse;
  const host = client();
  await join(host, { code: created.code, sessionToken: created.sessionToken });
  const guests: Socket[] = [];
  const acks: Extract<JoinAck, { ok: true }>[] = [];
  for (const n of names.slice(1)) {
    const s = client();
    const ack = await join(s, { code: created.code, nickname: n });
    if (!ack.ok) throw new Error(ack.error);
    guests.push(s);
    acks.push(ack);
  }
  return { code: created.code, host, hostToken: created.sessionToken, guests, acks, hostId: created.playerId };
}

describe("rate limits", () => {
  it("caps clues and guesses per connection per second, then recovers", async () => {
    const { host, guests } = await room();
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    const errors: ErrorPayload[] = [];
    host.on(EVENTS.error, (e: ErrorPayload) => errors.push(e));
    for (let i = 0; i < 8; i++) host.emit(EVENTS.clue, { text: `clue number ${i}` });
    await sleep(150);
    expect(errors.filter((e) => e.code === "rate_limited").length).toBeGreaterThanOrEqual(3);

    const ann = guests[0]!;
    const guessErrors: ErrorPayload[] = [];
    ann.on(EVENTS.error, (e: ErrorPayload) => guessErrors.push(e));
    for (let i = 0; i < 8; i++) ann.emit(EVENTS.guess, { text: `wrong ${i}` });
    await sleep(150);
    expect(guessErrors.filter((e) => e.code === "rate_limited").length).toBeGreaterThanOrEqual(3);

    now += 5_000; // tokens refill
    const result = once<{ result: string }>(ann, EVENTS.guessResult);
    ann.emit(EVENTS.guess, { text: "another" });
    expect((await result).result).toBe("wrong");
  });

  it("caps fresh joins per IP address", async () => {
    const created = (await (await post({ nickname: "Host" })).json()) as CreateRoomResponse;
    const results: JoinAck[] = [];
    for (let i = 0; i < 12; i++) {
      const s = client();
      results.push(await join(s, { code: created.code, nickname: `Guest${i}` }));
    }
    const limited = results.filter((r) => !r.ok && r.error === "rate_limited");
    expect(limited.length).toBeGreaterThanOrEqual(1);
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(10);
  });

  it("caps room creation per IP, with a Retry-After header", async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 7; i++) {
      last = await post({ nickname: `Host${i}` });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    expect(await last!.json()).toEqual({ error: "rate_limited" });
  });

  it("caps room-code probing", async () => {
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await fetch(`${url}/api/rooms/ZZZZZ`)).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
});

describe("resource caps and malformed input", () => {
  it("closes a connection that sends an oversized message, and the server keeps running", async () => {
    const big = client();
    await once(big, "connect");
    const closed = once(big, "disconnect");
    big.emit(EVENTS.join, { code: "ZZZZZ", nickname: "x".repeat(200_000) }, () => undefined);
    await closed;
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    const created = (await (await post({ nickname: "Still" })).json()) as CreateRoomResponse;
    expect((await join(client(), { code: created.code, sessionToken: created.sessionToken })).ok).toBe(true);
  });

  it("answers malformed events with stable error codes and never crashes", async () => {
    const { host } = await room(["Host", "Ann"]);
    const errors: string[] = [];
    host.on(EVENTS.error, (e: ErrorPayload) => errors.push(e.code));
    const junk: unknown[] = [null, undefined, 42, "text", [], {}, { text: 5 }, { text: "x".repeat(5000) }, { __proto__: { evil: 1 } }, { playerId: "nope" }];
    for (const j of junk) {
      for (const ev of [EVENTS.clue, EVENTS.guess, EVENTS.configure, EVENTS.kick]) host.emit(ev as never, j as never);
      host.emit(EVENTS.join as never, j as never, (() => undefined) as never);
    }
    host.emit("not:an:event", { a: 1 });
    await sleep(300);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((c) => ["invalid_payload", "rate_limited", "not_in_room", "out_of_turn", "not_host"].includes(c))).toBe(true);
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
  });

  it("rejects bad REST bodies without leaking details", async () => {
    for (const body of ["{", "[]", '"x"', "null"]) {
      const r = await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "invalid_payload" });
    }
    const huge = await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "a".repeat(10_000) }) });
    expect(huge.status).toBe(400);
  });
});

describe("blocklist and host kick", () => {
  it("rejects blocked nicknames when creating or joining", async () => {
    const r = await post({ nickname: "sh1t" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "blocked_content" });
    const created = (await (await post({ nickname: "Host" })).json()) as CreateRoomResponse;
    expect(await join(client(), { code: created.code, nickname: "f u c k" })).toEqual({ ok: false, error: "blocked_content" });
  });

  it("rejects a blocked clue to the explainer alone, without echoing the word or broadcasting it", async () => {
    const { host, guests } = await room(["Host", "Ann"]);
    const seen: string[] = [];
    guests[0]!.onAny((_e: string, ...a: unknown[]) => seen.push(JSON.stringify(a)));
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    const rej = once<ClueRejection>(host, EVENTS.clueRejected);
    host.emit(EVENTS.clue, { text: "what a bitch of a problem" });
    expect(await rej).toEqual({ reason: "inappropriate", word: "" });
    await sleep(100);
    expect(seen.join()).not.toMatch(/bitch/i);
  });

  it("lets the host remove a player, who is told and cannot rejoin", async () => {
    const { code, host, guests, acks } = await room();
    const [ann, ben] = guests as [Socket, Socket];
    const annAck = acks[0]!;
    const told = once<ErrorPayload>(ann, EVENTS.error);
    const roster = state(ben, (v) => v.players.length === 2);
    host.emit(EVENTS.kick, { playerId: annAck.playerId });
    expect((await told).code).toBe("kicked");
    expect((await roster).players.map((p) => p.nickname)).toEqual(["Host", "Ben"]);
    expect(await join(client(), { code, sessionToken: annAck.sessionToken! })).toEqual({ ok: false, error: "bad_session" });
    expect(await join(client(), { code, nickname: "ann" })).toEqual({ ok: false, error: "kicked" });
  });

  it("only the host can kick, and never themselves", async () => {
    const { host, guests, acks, hostId } = await room();
    const err = once<ErrorPayload>(guests[0]!, EVENTS.error);
    guests[0]!.emit(EVENTS.kick, { playerId: acks[1]!.playerId });
    expect((await err).code).toBe("not_host");
    const self = once<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.kick, { playerId: hostId });
    expect((await self).code).toBe("invalid_payload");
  });

  it("a kicked explainer ends the round", async () => {
    const { host, guests, acks } = await room(["Host", "Ann", "Ben"]);
    host.emit(EVENTS.start);
    const v = await state(host, (x) => x.phase === "round");
    const explainer = v.round!.explainerId;
    expect(explainer).toBe(v.hostId); // host explains first; make Ann the explainer in round 2 instead
    now += 60_000;
    tick();
    now += REVEAL_MS;
    tick();
    const r2 = await state(host, (x) => x.phase === "round" && x.round?.number === 2);
    expect(r2.round!.explainerId).toBe(acks[0]!.playerId);
    const reveal = state(guests[1]!, (x) => x.phase === "reveal");
    host.emit(EVENTS.kick, { playerId: acks[0]!.playerId });
    expect((await reveal).reveal?.outcome).toBe("explainer_left");
  });
});

describe("disconnect rules", () => {
  it("skips the round if the explainer stays disconnected for 20 seconds, then the next explainer starts", async () => {
    const { host, guests, acks } = await room(["Host", "Ann", "Ben"]);
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    const away = state(guests[0]!, (v) => v.players.find((p) => p.isHost)?.connected === false);
    host.disconnect();
    await away;
    now += EXPLAINER_GRACE_MS - 1000;
    expect(tick()).toEqual([]); // still within the grace period: nothing happens
    const reveal = state(guests[0]!, (v) => v.phase === "reveal");
    now += 1000;
    tick();
    expect((await reveal).reveal?.outcome).toBe("explainer_left");
    const next = state(guests[1]!, (v) => v.phase === "round" && v.round?.number === 2);
    now += REVEAL_MS;
    tick();
    expect((await next).round!.explainerId).toBe(acks[0]!.playerId); // Ann, not the absent host
  });

  it("an explainer who reconnects within 20 seconds keeps the round", async () => {
    const { code, host, hostToken, guests } = await room(["Host", "Ann"]);
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    host.disconnect();
    await state(guests[0]!, (v) => v.players.find((p) => p.isHost)?.connected === false);
    now += 15_000;
    tick();
    const back = client();
    const view = state(back, (v) => v.phase === "round");
    await join(back, { code, sessionToken: hostToken });
    expect((await view).round?.explainerCard?.prompt).toBe("Zorblaxium");
    now += 10_000; // 25s since they left, but they came back
    expect(tick()).not.toContain(code);
  });

  it("passes the host role on after a long absence", async () => {
    const { host, guests, acks } = await room(["Host", "Ann", "Ben"]);
    const away = state(guests[0]!, (v) => v.players.find((p) => p.isHost)?.connected === false);
    host.disconnect();
    await away;
    now += HOST_GRACE_MS - 1000;
    tick();
    expect(app.rooms.view([...[app.rooms.get([...app.rooms.codes()][0]!)!]][0]!).hostId).not.toBe(acks[0]!.playerId);
    const moved = state(guests[1]!, (v) => v.hostId === acks[0]!.playerId);
    now += 1000;
    tick();
    expect((await moved).hostId).toBe(acks[0]!.playerId); // Ann: longest-present connected player
  });
});

describe("security headers", () => {
  it("are present on app and API responses", async () => {
    for (const path of ["/healthz", "/api/decks", "/api/rooms/ZZZZZ"]) {
      const r = await fetch(`${url}${path}`);
      expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("x-powered-by")).toBeNull();
    }
  });
  it("sends HSTS only over HTTPS", async () => {
    expect((await fetch(`${url}/healthz`)).headers.get("strict-transport-security")).toBeNull();
    const r = await fetch(`${url}/healthz`, { headers: { "x-forwarded-proto": "https" } });
    expect(r.headers.get("strict-transport-security")).toContain("max-age=");
  });
});
