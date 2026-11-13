import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import { Server } from "socket.io";
import {
  SUBJECTS,
  type Card,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@stemcharades/shared";
import { GameRunner } from "./game/gameRunner.js";
import { RoomManager } from "./game/roomManager.js";
import { MAX_CONNECTIONS, MAX_MESSAGE_BYTES, TRUST_PROXY } from "./config.js";
import { authRouter } from "./http/auth.js";
import { meRouter } from "./http/me.js";
import { roomsRouter } from "./http/rooms.js";
import { createPersistence } from "./persist.js";
import { loadProviders, type FetchFn, type Provider } from "./auth/providers.js";
import { getDeck, type Db } from "./db/repo.js";
import { securityHeaders } from "./http/security.js";
import { createLimits, type Limits } from "./realtime/rateLimit.js";
import { registerHandlers, type GameServer, type SocketData } from "./realtime/handlers.js";

export interface AppOptions {
  /** Directory holding the built client. Omit to skip static hosting. */
  clientDir?: string;
  /** Cards served by the deck routes (already validated by the deck loader). */
  cards?: Card[];
  rooms?: RoomManager;
  /** Injectable for tests: the game clock and random source. */
  clock?: () => number;
  rng?: () => number;
  limits?: Limits;
  /** Optional database. Without it the game runs exactly as before and sign-in is unavailable. */
  db?: Db;
  sessionSecret?: string;
  providers?: Provider[];
  publicUrl?: string;
  /** Injectable for tests so the OAuth exchange never touches the network. */
  fetchFn?: FetchFn;
}

export function createApp(options: AppOptions = {}): {
  httpServer: HttpServer;
  io: GameServer;
  rooms: RoomManager;
  runner: GameRunner;
  limits: Limits;
} {
  const app = express();
  app.disable("x-powered-by");
  // Behind Render's proxy, req.ip must be the real client for per-IP limits.
  if (TRUST_PROXY) app.set("trust proxy", 1);
  app.use(securityHeaders);
  const limits = options.limits ?? createLimits(options.clock);
  const rooms = options.rooms ?? new RoomManager({ now: options.clock });
  const runner = new GameRunner(rooms, options.cards ?? [], options.clock, options.rng, createPersistence(options.db));
  const providers = options.providers ?? loadProviders(process.env);
  const sessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const authEnabled = Boolean(options.db && sessionSecret && providers.length);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  const cards = options.cards ?? [];
  app.get("/api/decks", (_req, res) => {
    res.json(
      SUBJECTS.map((subject) => ({
        subject,
        levels: [1, 2, 3].map((level) => ({
          level,
          count: cards.filter((c) => c.subject === subject && c.level === level).length,
        })),
        count: cards.filter((c) => c.subject === subject).length,
      })),
    );
  });
  app.get("/api/decks/:subject/cards", (req, res) => {
    const subject = SUBJECTS.find((s) => s.toLowerCase() === req.params.subject.toLowerCase());
    if (!subject) {
      res.status(404).json({ error: "unknown_subject" });
      return;
    }
    res.json(cards.filter((c) => c.subject === subject));
  });

  app.use("/api/rooms", roomsRouter(rooms, limits, authEnabled ? sessionSecret : undefined));
  const cardsById = new Map((options.cards ?? []).map((c) => [c.id, c]));
  if (authEnabled) {
    app.use("/api/auth", authRouter({ db: options.db!, providers, secret: sessionSecret!, limits, publicUrl: options.publicUrl ?? process.env.PUBLIC_URL, fetchFn: options.fetchFn }));
  }
  app.use("/api/me", meRouter({ db: options.db, secret: sessionSecret, providers: authEnabled ? providers : [], cardsById, limits }));

  const { clientDir } = options;
  if (clientDir && existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  const httpServer = createServer(app);
  const io: GameServer = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    // Oversized messages close the connection instead of being buffered.
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
  });
  // Resource cap: a hard ceiling on simultaneous connections for the 512 MB instance.
  io.use((_socket, next) => {
    if (io.engine.clientsCount > MAX_CONNECTIONS) next(new Error("server_full"));
    else next();
  });
registerHandlers(io, rooms, runner, limits, {
    sessionSecret: authEnabled ? sessionSecret : undefined,
    loadCustomDeck: options.db ? (userId, deckId) => getDeck(options.db!, userId, deckId) : undefined,
  });

  return { httpServer, io, rooms, runner, limits };
}
