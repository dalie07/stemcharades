import type { Server } from "socket.io";
import {
  ERROR_MESSAGES,
  EVENTS,
  clueSchema,
  deckSelectPayloadSchema,
  guessSchema,
  joinPayloadSchema,
  kickPayloadSchema,
  settingsSchema,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
} from "@stemcharades/shared";
import { HOST_GRACE_MS, TRUST_PROXY } from "../config.js";
import { isBlocked } from "../game/blocklist.js";
import type { Card } from "@stemcharades/shared";
import { userIdFromCookies } from "../auth/session.js";
import type { RoomManager, Seat } from "../game/roomManager.js";
import type { GameRunner, RunResult } from "../game/gameRunner.js";
import { clientIp, limitKey, type Limits } from "./rateLimit.js";

export interface SocketData {
  code?: string;
  playerId?: string;
  /** The signed-in account behind this connection, if any. */
  userId?: string;
}

/** Optional features, present only when a database is configured. */
export interface HandlerServices {
  sessionSecret?: string;
  /** The owner's own private deck, or null if it does not exist or is not theirs. */
  loadCustomDeck?: (userId: string, deckId: string) => Promise<{ id: string; name: string; cards: Card[] } | null>;
}
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Send each connected player their own view. Views differ by role, so the room is never
 * broadcast one shared snapshot: a guesser's socket is only ever given the guesser view.
 */
export function broadcastRoom(io: GameServer, rooms: RoomManager, runner: GameRunner, code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit(EVENTS.state, runner.viewFor(room, p.id));
  }
}

/** Validation, rate limiting and plumbing only. No game rules live here. */
export function registerHandlers(
  io: GameServer,
  rooms: RoomManager,
  runner: GameRunner,
  limits: Limits,
  services: HandlerServices = {},
): void {
  io.on("connection", (socket) => {
    // The session cookie travels with the WebSocket handshake. It is signed, so it cannot be forged.
    const uid = userIdFromCookies(socket.handshake.headers.cookie, services.sessionSecret);
    if (uid) socket.data.userId = uid;
    const ip = limitKey(clientIp(socket.handshake.headers, socket.handshake.address, TRUST_PROXY));
    const sendError = (code: ErrorCode) => socket.emit(EVENTS.error, { code, message: ERROR_MESSAGES[code] });
    const broadcast = (code: string) => broadcastRoom(io, rooms, runner, code);

    /** A bug in one handler must never take the server down for every room. */
    const safely = (fn: () => void) => {
      try {
        fn();
      } catch (err) {
        console.error("socket handler error", err);
        sendError("invalid_payload");
      }
    };
    /** Per-connection limits: a specific bucket for guesses and clues, a general one for the rest. */
    const allowed = (kind: "guess" | "clue" | "event"): boolean => {
      if (limits[kind].take(`${socket.id}`)) return true;
      sendError("rate_limited");
      return false;
    };

    let lastGuess = "";

    /** Run an engine event for this socket's player and deliver the outcome. */
    const run = (build: (playerId: string) => Parameters<GameRunner["apply"]>[1]) => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return sendError("not_in_room");
      const res: RunResult = runner.apply(code, build(playerId));
      if (!res.ok) return sendError(res.error);
      for (const effect of res.effects) {
        const target = rooms.get(code)?.players.find((p) => p.id === effect.playerId)?.socketId;
        if (!target) continue;
        if (effect.type === "clueRejected") io.to(target).emit(EVENTS.clueRejected, effect.rejection);
        // Only the guesser learns correct/close/wrong, and never the answer itself.
        else io.to(target).emit(EVENTS.guessResult, { result: effect.result, guess: lastGuess });
      }
      broadcast(code);
    };

    socket.on(EVENTS.join, (raw, ack) =>
      safely(() => {
        if (typeof ack !== "function") return;
        if (!limits.event.take(socket.id)) return ack({ ok: false, error: "rate_limited" });
        const parsed = joinPayloadSchema.safeParse(raw);
        if (!parsed.success) return ack({ ok: false, error: "invalid_payload" });
        const { code, nickname, sessionToken } = parsed.data;

        // Fresh joins (guessable room codes) are limited per IP. Rejoining needs the secret token.
        if (!sessionToken) {
          if (!limits.join.take(ip)) return ack({ ok: false, error: "rate_limited" });
          if (isBlocked(nickname!)) return ack({ ok: false, error: "blocked_content" });
        }

        // A fresh join gets a new token back; a rejoin already holds its token.
        const seat = sessionToken ? rooms.rejoin(code, sessionToken) : rooms.join(code, nickname!, socket.data.userId);
        if (!seat.ok) return ack({ ok: false, error: seat.error });
        const { room, player } = seat.value;
        const newToken = sessionToken ? undefined : (seat.value as Seat).sessionToken;

        // Leave any previous room this socket was in.
        if (socket.data.code && socket.data.code !== code) void socket.leave(socket.data.code);
        rooms.attach(code, player.id, socket.id);
        socket.data.code = code;
        socket.data.playerId = player.id;
        void socket.join(code);

        ack({ ok: true, playerId: player.id, sessionToken: newToken });
        broadcast(room.code);
      }),
    );

    socket.on(EVENTS.configure, (raw) =>
      safely(() => {
        if (!allowed("event")) return;
        const { code, playerId } = socket.data;
        if (!code || !playerId) return sendError("not_in_room");
        const parsed = settingsSchema.safeParse(raw);
        if (!parsed.success) return sendError("invalid_payload");
        const res = rooms.configure(code, playerId, parsed.data);
        if (!res.ok) return sendError(res.error);
        broadcast(code);
      }),
    );

    socket.on(EVENTS.deck, (raw) => {
      void (async () => {
        try {
          if (!allowed("event")) return;
          const { code, playerId, userId } = socket.data;
          if (!code || !playerId) return sendError("not_in_room");
          const parsed = deckSelectPayloadSchema.safeParse(raw);
          if (!parsed.success) return sendError("invalid_payload");
          if (parsed.data.deckId === null) {
            const cleared = rooms.setCustomDeck(code, playerId, null);
            if (!cleared.ok) return sendError(cleared.error);
          } else {
            // Private decks belong to a signed-in account, and only the owner can use theirs.
            if (!userId || !services.loadCustomDeck) return sendError("unauthorized");
            const deck = await services.loadCustomDeck(userId, parsed.data.deckId);
            if (!deck || deck.cards.length === 0) return sendError("unknown_deck");
            const set = rooms.setCustomDeck(code, playerId, deck);
            if (!set.ok) return sendError(set.error);
          }
          broadcast(code);
        } catch (err) {
          console.error("deck select failed", err);
          sendError("invalid_payload");
        }
      })();
    });

    socket.on(EVENTS.start, () =>
      safely(() => {
        if (allowed("event")) run((playerId) => ({ type: "start", playerId }));
      }),
    );

    socket.on(EVENTS.clue, (raw) =>
      safely(() => {
        if (!allowed("clue")) return;
        const parsed = clueSchema.safeParse(raw);
        if (!parsed.success) return sendError("invalid_payload");
        run((playerId) => ({ type: "clue", playerId, text: parsed.data.text }));
      }),
    );

    socket.on(EVENTS.guess, (raw) =>
      safely(() => {
        if (!allowed("guess")) return;
        const parsed = guessSchema.safeParse(raw);
        if (!parsed.success) return sendError("invalid_payload");
        lastGuess = parsed.data.text;
        run((playerId) => ({ type: "guess", playerId, text: parsed.data.text }));
      }),
    );

    socket.on(EVENTS.skip, () =>
      safely(() => {
        if (allowed("event")) run((playerId) => ({ type: "skip", playerId }));
      }),
    );

    socket.on(EVENTS.kick, (raw) =>
      safely(() => {
        if (!allowed("event")) return;
        const { code, playerId } = socket.data;
        if (!code || !playerId) return sendError("not_in_room");
        const parsed = kickPayloadSchema.safeParse(raw);
        if (!parsed.success) return sendError("invalid_payload");
        const res = rooms.kick(code, playerId, parsed.data.playerId);
        if (!res.ok) return sendError(res.error);
        const { target } = res.value;
        runner.apply(code, { type: "playerLeft", playerId: target.id });
        const targetSocket = target.socketId ? io.sockets.sockets.get(target.socketId) : undefined;
        if (targetSocket) {
          void targetSocket.leave(code);
          targetSocket.data = {};
          targetSocket.emit(EVENTS.error, { code: "kicked", message: ERROR_MESSAGES.kicked });
        }
        broadcast(code);
      }),
    );

    socket.on(EVENTS.leave, () =>
      safely(() => {
        const { code, playerId } = socket.data;
        if (!code || !playerId) return;
        const room = rooms.leave(code, playerId);
        void socket.leave(code);
        socket.data = {};
        if (room) runner.apply(code, { type: "playerLeft", playerId });
        broadcast(code);
      }),
    );

    socket.on("disconnect", () => {
      for (const kind of ["guess", "clue", "event"] as const) limits[kind].forget(socket.id);
      const { code, playerId } = socket.data;
      if (code && playerId && rooms.detach(code, playerId, socket.id)) broadcast(code);
    });
  });
}

/** The server-run timer: end rounds that ran out of time or lost their explainer, and move on after reveals. */
export function tickGames(io: GameServer, rooms: RoomManager, runner: GameRunner): string[] {
  const changed = new Set(runner.tickAll());
  for (const code of rooms.reassignAbsentHosts(HOST_GRACE_MS)) changed.add(code);
  for (const code of changed) broadcastRoom(io, rooms, runner, code);
  return [...changed];
}

/** Drop idle rooms and tell anyone still connected to them. */
export function sweepRooms(io: GameServer, rooms: RoomManager): string[] {
  const removed = rooms.sweep();
  for (const code of removed) {
    io.to(code).emit(EVENTS.error, { code: "unknown_room", message: ERROR_MESSAGES.unknown_room });
    io.in(code).socketsLeave(code);
  }
  return removed;
}
