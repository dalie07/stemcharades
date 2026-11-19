import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  MAX_PLAYERS_PER_ROOM,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ErrorCode,
  type RoomSettings,
  type RoomView,
  DEFAULT_SETTINGS,
} from "@stemcharades/shared";
import type { Card } from "@stemcharades/shared";
import { newGame, type Game } from "./roundEngine.js";
import { MAX_ROOMS, ROOM_IDLE_MS, UNCLAIMED_ROOM_MS } from "../config.js";

export interface Player {
  id: string;
  nickname: string;
  /** Set only when the player was signed in. Guests have none. */
  userId?: string;
  sessionTokenHash: string;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  socketId: string | null;
}

export interface Room {
  code: string;
  hostId: string;
  settings: RoomSettings;
  game: Game;
  players: Player[];
  /** Nicknames of players the host removed, so they cannot simply rejoin. */
  kicked: Set<string>;
  /** The host's private deck, used instead of the built-in cards. Held in memory like the rest of the room. */
  customDeck?: { id: string; name: string; cards: Card[] };
  /** Whether any socket has ever taken a seat. Unclaimed rooms expire quickly. */
  claimed: boolean;
  createdAt: number;
  lastActivityAt: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: ErrorCode): Result<never> => ({ ok: false, error });

export interface Seat {
  room: Room;
  player: Player;
  /** Plain token, returned once to the client. Only its hash is stored. */
  sessionToken: string;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(16).toString("hex"); // 128 bits
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface RoomManagerOptions {
  now?: () => number;
  maxRooms?: number;
  maxPlayers?: number;
  idleMs?: number;
  unclaimedMs?: number;
}

/** Owns the in-memory room map. No sockets in here: callers pass socket ids in. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private now: () => number;
  private maxRooms: number;
  private maxPlayers: number;
  private idleMs: number;
  private unclaimedMs: number;

  constructor(opts: RoomManagerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxRooms = opts.maxRooms ?? MAX_ROOMS;
    this.maxPlayers = opts.maxPlayers ?? MAX_PLAYERS_PER_ROOM;
    this.idleMs = opts.idleMs ?? ROOM_IDLE_MS;
    this.unclaimedMs = opts.unclaimedMs ?? UNCLAIMED_ROOM_MS;
  }

  get size() {
    return this.rooms.size;
  }

  codes(): string[] {
    return [...this.rooms.keys()];
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  private newCode(): string | null {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  private makePlayer(nickname: string, userId?: string): { player: Player; sessionToken: string } {
    const sessionToken = newToken();
    const t = this.now();
    return {
      sessionToken,
      player: {
        id: randomUUID(),
        nickname: nickname.trim(),
        ...(userId ? { userId } : {}),
        sessionTokenHash: hashToken(sessionToken),
        connected: false,
        joinedAt: t,
        lastSeenAt: t,
        socketId: null,
      },
    };
  }

  createRoom(nickname: string, userId?: string): Result<Seat> {
    if (this.rooms.size >= this.maxRooms) return fail("server_full");
    const code = this.newCode();
    if (!code) return fail("server_full");
    const { player, sessionToken } = this.makePlayer(nickname, userId);
    const t = this.now();
    const room: Room = {
      code,
      hostId: player.id,
      settings: { ...DEFAULT_SETTINGS },
      game: newGame(),
      players: [player],
      kicked: new Set(),
      claimed: false,
      createdAt: t,
      lastActivityAt: t,
    };
    this.rooms.set(code, room);
    return ok({ room, player, sessionToken });
  }

  /** Whether a room exists and a new player could still join it. */
  status(code: string): { exists: boolean; joinable: boolean; players: number } {
    const room = this.rooms.get(code);
    if (!room) return { exists: false, joinable: false, players: 0 };
    return { exists: true, joinable: room.players.length < this.maxPlayers, players: room.players.length };
  }

  join(code: string, nickname: string, userId?: string): Result<Seat> {
    const room = this.rooms.get(code);
    if (!room) return fail("unknown_room");
    if (room.players.length >= this.maxPlayers) return fail("room_full");
    if (room.kicked.has(nickname.trim().toLowerCase())) return fail("kicked");
    if (room.players.some((p) => sameName(p.nickname, nickname))) return fail("nickname_taken");
    const { player, sessionToken } = this.makePlayer(nickname, userId);
    room.players.push(player);
    room.lastActivityAt = this.now();
    return ok({ room, player, sessionToken });
  }

  /** Same seat, same score, same role, found by the hash of the saved token. */
  rejoin(code: string, sessionToken: string): Result<{ room: Room; player: Player }> {
    const room = this.rooms.get(code);
    if (!room) return fail("unknown_room");
    const hash = hashToken(sessionToken);
    const player = room.players.find((p) => p.sessionTokenHash === hash);
    if (!player) return fail("bad_session");
    room.lastActivityAt = this.now();
    return ok({ room, player });
  }

  attach(code: string, playerId: string, socketId: string): void {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return;
    player.connected = true;
    player.socketId = socketId;
    player.lastSeenAt = this.now();
    room.claimed = true;
    room.lastActivityAt = this.now();
  }

  /** Ignores stale sockets: a refreshed player's old socket must not mark the new one offline. */
  detach(code: string, playerId: string, socketId: string): boolean {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || player.socketId !== socketId) return false;
    player.connected = false;
    player.socketId = null;
    player.lastSeenAt = this.now();
    return true;
  }

  configure(code: string, playerId: string, settings: RoomSettings): Result<Room> {
    const room = this.rooms.get(code);
    if (!room || !room.players.some((p) => p.id === playerId)) return fail("not_in_room");
    if (room.hostId !== playerId) return fail("not_host");
    if (room.game.phase === "round" || room.game.phase === "reveal") return fail("out_of_turn");
    room.settings = settings;
    room.lastActivityAt = this.now();
    return ok(room);
  }

  /** The host picks (or clears) a private deck. Only allowed between games. */
  setCustomDeck(code: string, playerId: string, deck: Room["customDeck"] | null): Result<Room> {
    const room = this.rooms.get(code);
    if (!room || !room.players.some((p) => p.id === playerId)) return fail("not_in_room");
    if (room.hostId !== playerId) return fail("not_host");
    if (room.game.phase === "round" || room.game.phase === "reveal") return fail("out_of_turn");
    if (deck) room.customDeck = deck;
    else delete room.customDeck;
    room.lastActivityAt = this.now();
    return ok(room);
  }

  /** Host removes another player. Returns the removed player so the caller can disconnect their socket. */
  kick(code: string, hostId: string, targetId: string): Result<{ room: Room; target: Player }> {
    const room = this.rooms.get(code);
    if (!room || !room.players.some((p) => p.id === hostId)) return fail("not_in_room");
    if (room.hostId !== hostId) return fail("not_host");
    const target = room.players.find((p) => p.id === targetId);
    if (!target || target.id === hostId) return fail("invalid_payload");
    room.players = room.players.filter((p) => p.id !== targetId);
    room.kicked.add(target.nickname.toLowerCase());
    room.lastActivityAt = this.now();
    return ok({ room, target });
  }

  /** A host who has been gone for `graceMs` hands the role to the longest-present connected player. */
  reassignAbsentHosts(graceMs: number): string[] {
    const changed: string[] = [];
    for (const room of this.rooms.values()) {
      const host = room.players.find((p) => p.id === room.hostId);
      if (!host || host.connected || this.now() - host.lastSeenAt < graceMs) continue;
      const next = [...room.players].filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) {
        room.hostId = next.id;
        changed.push(room.code);
      }
    }
    return changed;
  }

  /** Deliberate leave. The host role passes to the longest-present player; empty rooms vanish. */
  leave(code: string, playerId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.players = room.players.filter((p) => p.id !== playerId);
    room.lastActivityAt = this.now();
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return null;
    }
    if (room.hostId === playerId) {
      const byJoin = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt);
      room.hostId = (byJoin.find((p) => p.connected) ?? byJoin[0])!.id;
    }
    return room;
  }

  /** Remove rooms idle past the limit, and rooms nobody ever joined. Returns the removed codes. */
  sweep(): string[] {
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      const idle = this.now() - room.lastActivityAt;
      if (idle > this.idleMs || (!room.claimed && idle > this.unclaimedMs)) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }

  /** What clients may see. Never includes token hashes or socket ids. */
  view(room: Room): RoomView {
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.game.phase,
      ...(room.customDeck ? { customDeck: { name: room.customDeck.name, count: room.customDeck.cards.length } } : {}),
      settings: room.settings,
      players: [...room.players]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          connected: p.connected,
          isHost: p.id === room.hostId,
          score: room.game.scores[p.id] ?? 0,
        })),
    };
  }
}
