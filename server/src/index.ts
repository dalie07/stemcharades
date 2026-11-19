import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { GAME_TICK_MS, SWEEP_INTERVAL_MS } from "./config.js";
import { loadDecks } from "./content/deckLoader.js";
import { connectDb } from "./db/client.js";
import type { Db } from "./db/repo.js";
import { sweepRooms, tickGames } from "./realtime/handlers.js";
import { sweepLimits } from "./realtime/rateLimit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);

// Production serves reviewed cards only. ALLOW_DRAFT_CARDS=1 is for local work and tests.
const reviewedOnly = process.env.NODE_ENV === "production" && process.env.ALLOW_DRAFT_CARDS !== "1";
const cards = loadDecks(path.resolve(here, "../../content/decks"), { reviewedOnly });
console.log(`Loaded ${cards.length} cards (${reviewedOnly ? "reviewed only" : "drafts included"})`);
if (cards.length === 0) {
  console.warn("No cards to serve. Mark cards as reviewed in content/decks, or set ALLOW_DRAFT_CARDS=1 for local work.");
}

// The database is optional: accounts, history and custom decks need it, live games never do.
let db: Db | undefined;
let closeDb: (() => Promise<void>) | undefined;
if (process.env.DATABASE_URL) {
  try {
    ({ db, close: closeDb } = await connectDb(process.env.DATABASE_URL));
    console.log("Database connected");
  } catch (err) {
    console.error("Database unavailable, continuing without accounts:", err instanceof Error ? err.message : err);
  }
}

const { httpServer, io, rooms, runner, limits } = createApp({
  clientDir: path.resolve(here, "../../client/dist"),
  cards,
  db,
});

// Timers run inside the web process: there are no background workers on the free tier.
setInterval(() => tickGames(io, rooms, runner), GAME_TICK_MS).unref();
setInterval(() => {
  sweepRooms(io, rooms);
  sweepLimits(limits);
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(port, () => {
  console.log(`STEMCHARADES listening on :${port}`);
});

// Render sends SIGTERM before replacing an instance. Close sockets so clients reconnect to the new one at once.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(0), 5000).unref(); // never hang a deploy
  await io.close();
  await closeDb?.();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
