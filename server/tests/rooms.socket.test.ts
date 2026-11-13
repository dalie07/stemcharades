import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import {
  DEFAULT_SETTINGS,
  EVENTS,
  type CreateRoomResponse,
  type ErrorPayload,
  type JoinAck,
  type RoomView,
} from "@stemcharades/shared";
import { createApp } from "../src/app.js";
import { sweepRooms } from "../src/realtime/handlers.js";

let url: string;
let app: ReturnType<typeof createApp>;
const sockets: Socket[] = [];

beforeEach(async () => {
  app = createApp();
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => void app.io.close(() => r()));
});

const post = (path: string, body: unknown) =>
  fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function client(): Socket {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return s;
}
const join = (s: Socket, payload: object) =>
  new Promise<JoinAck>((resolve) => s.emit(EVENTS.join, payload, resolve));
const nextState = (s: Socket, pred: (v: RoomView) => boolean = () => true) =>
  new Promise<RoomView>((resolve) => {
    const h = (v: RoomView) => {
      if (pred(v)) {
        s.off(EVENTS.state, h);
        resolve(v);
      }
    };
    s.on(EVENTS.state, h);
  });
const nextError = (s: Socket) => new Promise<ErrorPayload>((r) => s.once(EVENTS.error, r));
const createRoom = async (nickname = "Host") => (await (await post("/api/rooms", { nickname })).json()) as CreateRoomResponse;

describe("REST", () => {
  it("creates a room and reports its status", async () => {
    const res = await post("/api/rooms", { nickname: "Host" });
    expect(res.status).toBe(201);
    const room = (await res.json()) as CreateRoomResponse;
    expect(room.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(room.sessionToken).toMatch(/^[0-9a-f]{32}$/);
    const status = await (await fetch(`${url}/api/rooms/${room.code.toLowerCase()}`)).json();
    expect(status).toEqual({ exists: true, joinable: true, players: 1 });
    expect(await (await fetch(`${url}/api/rooms/ZZZZZ`)).json()).toEqual({ exists: false, joinable: false, players: 0 });
  });
  it("rejects bad bodies with a stable error code", async () => {
    for (const body of [{}, { nickname: "x" }, { nickname: "a".repeat(50) }, { nickname: "ok name", extra: 1 }]) {
      const res = await post("/api/rooms", body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_payload" });
    }
    const bad = await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
    expect(bad.status).toBe(400);
    expect((await fetch(`${url}/api/rooms/bad!`)).status).toBe(400);
  });
});

describe("lobby over sockets", () => {
  it("four players join one room, survive a refresh and see the same lobby", async () => {
    const host = await createRoom("Host");
    const hostSock = client();
    expect((await join(hostSock, { code: host.code, sessionToken: host.sessionToken })).ok).toBe(true);

    const players: { sock: Socket; ack: Extract<JoinAck, { ok: true }> }[] = [];
    for (const name of ["Ann", "Ben", "Cat"]) {
      const sock = client();
      const ack = await join(sock, { code: host.code.toLowerCase(), nickname: name });
      if (!ack.ok) throw new Error(ack.error);
      expect(ack.sessionToken).toMatch(/^[0-9a-f]{32}$/);
      players.push({ sock, ack });
    }

    // "Refresh" Ben: drop the socket, reconnect with the saved token.
    const ben = players[1]!;
    const before = nextState(hostSock, (v) => v.players.find((p) => p.nickname === "Ben")?.connected === false);
    ben.sock.disconnect();
    expect((await before).players.find((p) => p.nickname === "Ben")?.connected).toBe(false);

    const fresh = client();
    const again = await join(fresh, { code: host.code, sessionToken: ben.ack.sessionToken });
    expect(again).toMatchObject({ ok: true, playerId: ben.ack.playerId });
    expect((again as { sessionToken?: string }).sessionToken).toBeUndefined();

    const view = await nextState(hostSock, (v) => v.players.every((p) => p.connected));
    expect(view.players.map((p) => p.nickname)).toEqual(["Host", "Ann", "Ben", "Cat"]);
    expect(view.players.find((p) => p.nickname === "Ben")?.id).toBe(ben.ack.playerId);
    expect(view.players.filter((p) => p.isHost).map((p) => p.nickname)).toEqual(["Host"]);
    expect(JSON.stringify(view)).not.toMatch(/sessionToken|Hash/);
  });

  it("reports stable errors for unknown room, taken nickname and bad payload", async () => {
    const host = await createRoom("Host");
    expect(await join(client(), { code: "ZZZZZ", nickname: "Ann" })).toEqual({ ok: false, error: "unknown_room" });
    expect(await join(client(), { code: host.code, nickname: "HOST" })).toEqual({ ok: false, error: "nickname_taken" });
    expect(await join(client(), { code: host.code })).toEqual({ ok: false, error: "invalid_payload" });
    expect(await join(client(), { code: host.code, nickname: "Ann", junk: true })).toEqual({ ok: false, error: "invalid_payload" });
    expect(await join(client(), { code: host.code, sessionToken: "0".repeat(32) })).toEqual({ ok: false, error: "bad_session" });
  });

  it("lets only the host configure, and validates settings", async () => {
    const host = await createRoom("Host");
    const hostSock = client();
    await join(hostSock, { code: host.code, sessionToken: host.sessionToken });
    const guest = client();
    await join(guest, { code: host.code, nickname: "Ann" });

    const denied = nextError(guest);
    guest.emit(EVENTS.configure, { ...DEFAULT_SETTINGS, rounds: 2 });
    expect((await denied).code).toBe("not_host");

    const invalid = nextError(hostSock);
    hostSock.emit(EVENTS.configure, { ...DEFAULT_SETTINGS, rounds: 99 });
    expect((await invalid).code).toBe("invalid_payload");

    const updated = nextState(guest, (v) => v.settings.rounds === 4);
    hostSock.emit(EVENTS.configure, { ...DEFAULT_SETTINGS, rounds: 4, roundSeconds: 90, subjects: ["Physics"] });
    const view = await updated;
    expect(view.settings).toMatchObject({ rounds: 4, roundSeconds: 90, subjects: ["Physics"] });
  });

  it("passes host to the next player when the host leaves", async () => {
    const host = await createRoom("Host");
    const hostSock = client();
    await join(hostSock, { code: host.code, sessionToken: host.sessionToken });
    const ann = client();
    await join(ann, { code: host.code, nickname: "Ann" });
    const view = nextState(ann, (v) => v.players.length === 1);
    hostSock.emit(EVENTS.leave);
    const after = await view;
    expect(after.players[0]?.nickname).toBe("Ann");
    expect(after.hostId).toBe(after.players[0]?.id);
  });

  it("tells connected players when an idle room expires", async () => {
    const host = await createRoom("Host");
    const sock = client();
    await join(sock, { code: host.code, sessionToken: host.sessionToken });
    const err = nextError(sock);
    // Re-create the manager clock effect by sweeping with a manager whose clock is far ahead.
    const room = app.rooms.get(host.code)!;
    room.lastActivityAt -= 31 * 60_000;
    expect(sweepRooms(app.io, app.rooms)).toEqual([host.code]);
    expect((await err).code).toBe("unknown_room");
  });

  it("ignores malformed events without crashing", async () => {
    const sock = client();
    sock.emit(EVENTS.join, "garbage");
    sock.emit(EVENTS.join, null, () => undefined);
    sock.emit(EVENTS.configure, { nope: 1 });
    const ack = await join(sock, { code: "ZZZZZ", nickname: "Ann" });
    expect(ack.ok).toBe(false);
  });
});
