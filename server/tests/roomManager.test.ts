import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, ROOM_CODE_ALPHABET, roomCodeSchema } from "@stemcharades/shared";
import { RoomManager, hashToken } from "../src/game/roomManager.js";

function setup(opts: ConstructorParameters<typeof RoomManager>[0] = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const rooms = new RoomManager({ now: clock.now, ...opts });
  const created = rooms.createRoom("Host");
  if (!created.ok) throw new Error("create failed");
  return { rooms, clock, ...created.value };
}

describe("room codes", () => {
  it("are 5 chars from the 32-char alphabet with no look-alikes", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO01]/);
    const { rooms } = setup();
    for (let i = 0; i < 100; i++) {
      const r = rooms.createRoom(`P${i}`);
      expect(r.ok && roomCodeSchema.safeParse(r.value.room.code).success).toBe(true);
    }
  });
  it("accept lower case and whitespace", () => {
    expect(roomCodeSchema.parse(" abc23 ")).toBe("ABC23");
  });
});

describe("joining", () => {
  it("adds players and rejects unknown rooms", () => {
    const { rooms, room } = setup();
    expect(rooms.join(room.code, "Ann").ok).toBe(true);
    expect(rooms.join("ZZZZZ", "Ann")).toEqual({ ok: false, error: "unknown_room" });
    expect(room.players).toHaveLength(2);
  });
  it("rejects a taken nickname, ignoring case and spaces", () => {
    const { rooms, room } = setup();
    expect(rooms.join(room.code, " host ")).toEqual({ ok: false, error: "nickname_taken" });
  });
  it("rejects a 13th player", () => {
    const { rooms, room } = setup();
    for (let i = 1; i < 12; i++) expect(rooms.join(room.code, `Player${i}`).ok).toBe(true);
    expect(rooms.join(room.code, "OneTooMany")).toEqual({ ok: false, error: "room_full" });
    expect(rooms.status(room.code)).toEqual({ exists: true, joinable: false, players: 12 });
  });
  it("caps the total number of rooms", () => {
    const rooms = new RoomManager({ maxRooms: 2 });
    rooms.createRoom("A1");
    rooms.createRoom("B2");
    expect(rooms.createRoom("C3")).toEqual({ ok: false, error: "server_full" });
  });
});

describe("session tokens", () => {
  it("are 128-bit hex and only their hash is stored", () => {
    const { player, sessionToken } = setup();
    expect(sessionToken).toMatch(/^[0-9a-f]{32}$/);
    expect(player.sessionTokenHash).toBe(hashToken(sessionToken));
    expect(JSON.stringify(player)).not.toContain(sessionToken);
  });
  it("restore the same seat, score and role", () => {
    const { rooms, room, player, sessionToken } = setup();
    const ann = rooms.join(room.code, "Ann");
    if (!ann.ok) throw new Error();
    room.game.scores[ann.value.player.id] = 42;
    rooms.attach(room.code, ann.value.player.id, "sock-1");
    rooms.detach(room.code, ann.value.player.id, "sock-1");
    const back = rooms.rejoin(room.code, ann.value.sessionToken);
    expect(back.ok && back.value.player.id).toBe(ann.value.player.id);
    expect(rooms.view(room).players.find((p) => p.nickname === "Ann")?.score).toBe(42);
    const host = rooms.rejoin(room.code, sessionToken);
    expect(host.ok && host.value.player.id).toBe(player.id);
  });
  it("reject a wrong token", () => {
    const { rooms, room } = setup();
    expect(rooms.rejoin(room.code, "0".repeat(32))).toEqual({ ok: false, error: "bad_session" });
  });
  it("a stale socket cannot mark a refreshed player offline", () => {
    const { rooms, room, player } = setup();
    rooms.attach(room.code, player.id, "old");
    rooms.attach(room.code, player.id, "new"); // refresh: new socket connects first
    expect(rooms.detach(room.code, player.id, "old")).toBe(false);
    expect(player.connected).toBe(true);
  });
});

describe("host controls and leaving", () => {
  it("lets only the host change settings", () => {
    const { rooms, room, player } = setup();
    const ann = rooms.join(room.code, "Ann");
    if (!ann.ok) throw new Error();
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    expect(rooms.configure(room.code, ann.value.player.id, next)).toEqual({ ok: false, error: "not_host" });
    expect(rooms.configure(room.code, player.id, next).ok).toBe(true);
    expect(room.settings.rounds).toBe(5);
  });
  it("passes the host role to the longest-present player", () => {
    const { rooms, room, clock, player } = setup();
    const ann = rooms.join(room.code, "Ann");
    clock.advance(1000);
    const ben = rooms.join(room.code, "Ben");
    if (!ann.ok || !ben.ok) throw new Error();
    rooms.attach(room.code, ann.value.player.id, "a");
    rooms.attach(room.code, ben.value.player.id, "b");
    rooms.leave(room.code, player.id);
    expect(room.hostId).toBe(ann.value.player.id);
  });
  it("removes the room when the last player leaves", () => {
    const { rooms, room, player } = setup();
    rooms.leave(room.code, player.id);
    expect(rooms.get(room.code)).toBeUndefined();
  });
});

describe("idle expiry", () => {
  it("removes a room idle for more than 30 minutes", () => {
    const { rooms, room, clock } = setup();
    clock.advance(29 * 60_000);
    expect(rooms.sweep()).toEqual([]);
    clock.advance(2 * 60_000);
    expect(rooms.sweep()).toEqual([room.code]);
    expect(rooms.get(room.code)).toBeUndefined();
  });
  it("activity keeps a room alive", () => {
    const { rooms, room, clock, player } = setup();
    clock.advance(25 * 60_000);
    rooms.attach(room.code, player.id, "s");
    clock.advance(25 * 60_000);
    expect(rooms.sweep()).toEqual([]);
  });
});

describe("view", () => {
  it("never exposes token hashes or socket ids", () => {
    const { rooms, room, player } = setup();
    rooms.attach(room.code, player.id, "secret-socket");
    const json = JSON.stringify(rooms.view(room));
    expect(json).not.toContain(player.sessionTokenHash);
    expect(json).not.toContain("secret-socket");
    expect(json).not.toContain("sessionToken");
  });
});
