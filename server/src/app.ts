import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import type { Card, ClientToServerEvents, ServerToClientEvents } from "@stemcharades/shared";
import { loadProviders, type FetchFn, type Provider } from "./auth/providers.js";
import { MAX_CONNECTIONS, MAX_CONNECTIONS_PER_IP, MAX_MESSAGE_BYTES, TRUST_PROXY } from "./config.js";
import { getDeck, type Db } from "./db/repo.js";
import { GameRunner } from "./game/gameRunner.js";
import { RoomManager } from "./game/roomManager.js";
import { authRouter } from "./http/auth.js";
import { catalogRouter, decksRouter } from "./http/decks.js";
import { meRouter } from "./http/me.js";
import { roomsRouter } from "./http/rooms.js";
import { securityHeaders } from "./http/security.js";
import { createPersistence } from "./persist.js";
import { registerHandlers, type GameServer, type SocketData } from "./realtime/handlers.js";
import { clientIp, createLimits, limitKey, type Limits } from "./realtime/rateLimit.js";

export interface AppOptions {
  /** Directory holding the built client. Omit to skip static hosting. */
  clientDir?: string;
  /** Cards to play with, already validated by the deck loader. */
  cards?: Card[];
  rooms?: RoomManager;
  limits?: Limits;
  /** Injectable for tests: the game clock and random source. */
  clock?: () => number;
  rng?: () => number;
  /** Optional database. Without it the game is guest-only and sign-in is unavailable. */
  db?: Db;
  sessionSecret?: string;
  providers?: Provider[];
  publicUrl?: string;
  /** Injectable for tests so the OAuth exchange never touches the network. */
  fetchFn?: FetchFn;
}

export interface App {
  httpServer: HttpServer;
  io: GameServer;
  rooms: RoomManager;
  runner: GameRunner;
  limits: Limits;
}

/** Build the whole server: static app, REST routes and the Socket.IO game, all on one HTTP server. */
export function createApp(options: AppOptions = {}): App {
  const cards = options.cards ?? [];
  const limits = options.limits ?? createLimits(options.clock);
  const rooms = options.rooms ?? new RoomManager({ now: options.clock });
  const runner = new GameRunner(rooms, cards, options.clock, options.rng, createPersistence(options.db));
  const cardsById = new Map(cards.map((c) => [c.id, c]));

  // Accounts need all three: a database, a session secret and at least one sign-in provider.
  const providers = options.providers ?? loadProviders(process.env);
  const sessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const authEnabled = Boolean(options.db && sessionSecret && providers.length);

  const app = express();
  app.disable("x-powered-by");
  // Behind Render's proxy, req.ip must be the real client for per-IP limits.
  if (TRUST_PROXY) app.set("trust proxy", 1);
  app.use(securityHeaders);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/decks", decksRouter(cards));
  app.use("/api/catalog", catalogRouter(cards));
  app.use("/api/rooms", roomsRouter(rooms, limits, authEnabled ? sessionSecret : undefined));
  if (authEnabled) {
    app.use(
      "/api/auth",
      authRouter({
        db: options.db!,
        providers,
        secret: sessionSecret!,
        limits,
        publicUrl: options.publicUrl ?? process.env.PUBLIC_URL,
        fetchFn: options.fetchFn,
      }),
    );
  }
  app.use(
    "/api/me",
    meRouter({
      db: options.db,
      secret: sessionSecret,
      providers: authEnabled ? providers : [],
      getCard: (id) => cardsById.get(id),
      limits,
    }),
  );

  const { clientDir } = options;
  if (clientDir && existsSync(clientDir)) {
    app.use(express.static(clientDir));
    // Single-page app: any other path gets the app shell.
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  const httpServer = createServer(app);
  const io: GameServer = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    // Oversized messages close the connection instead of being buffered.
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    // A page on another site must not open a game connection that carries this site's session cookie.
    allowRequest: (req, callback) => callback(null, sameOrigin(req.headers.origin, req.headers.host)),
  });

  // Resource caps for the 512 MB instance: a ceiling on connections overall, and per address so one client
  // cannot take them all.
  const perIp = new Map<string, number>();
  io.use((socket, next) => {
    const key = limitKey(clientIp(socket.handshake.headers, socket.handshake.address, TRUST_PROXY));
    const open = perIp.get(key) ?? 0;
    if (io.engine.clientsCount > MAX_CONNECTIONS || open >= MAX_CONNECTIONS_PER_IP) return next(new Error("server_full"));
    perIp.set(key, open + 1);
    socket.once("disconnect", () => {
      const left = (perIp.get(key) ?? 1) - 1;
      if (left > 0) perIp.set(key, left);
      else perIp.delete(key);
    });
    next();
  });
  registerHandlers(io, rooms, runner, limits, {
    sessionSecret: authEnabled ? sessionSecret : undefined,
    loadCustomDeck: options.db ? (userId, deckId) => getDeck(options.db!, userId, deckId) : undefined,
  });

  return { httpServer, io, rooms, runner, limits };
}

/**
 * Browsers always send Origin on a WebSocket or polling request, so a mismatch means another site's page.
 * Clients that are not browsers send none and are let through: they carry no victim's cookies.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
