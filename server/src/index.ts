import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadDecks } from "./content/deckLoader.js";
import { connectDb } from "./db/client.js";
import { GAME_TICK_MS, SWEEP_INTERVAL_MS } from "./config.js";
import { sweepLimits } from "./realtime/rateLimit.js";
import { sweepRooms, tickGames } from "./realtime/handlers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const clientDir = path.resolve(here, "../../client/dist");

// Production serves reviewed cards only. ALLOW_DRAFT_CARDS=1 is for local work.
const reviewedOnly = process.env.NODE_ENV === "production" && process.env.ALLOW_DRAFT_CARDS !== "1";
const cards = loadDecks(path.resolve(here, "../../content/decks"), { reviewedOnly });
console.log(`Loaded ${cards.length} cards (reviewedOnly=${reviewedOnly})`);

// The database is optional: accounts, history and custom decks need it, live games never do.
let db: Awaited<ReturnType<typeof connectDb>>["db"] | undefined;
if (process.env.DATABASE_URL) {
  try {
    ({ db } = await connectDb(process.env.DATABASE_URL));
    console.log("Database connected");
  } catch (err) {
    console.error("Database unavailable, continuing without accounts:", err instanceof Error ? err.message : err);
  }
}

const { httpServer, io, rooms, runner, limits } = createApp({ clientDir, cards, db });
setInterval(() => {
  sweepRooms(io, rooms);
  sweepLimits(limits);
}, SWEEP_INTERVAL_MS).unref();
// Timers run inside the web process: no background workers on the free tier.
setInterval(() => tickGames(io, rooms, runner), GAME_TICK_MS).unref();
httpServer.listen(port, () => {
  console.log(`STEMCHARADES server listening on :${port}`);
});
