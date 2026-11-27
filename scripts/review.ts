/**
 * The card review tool: review, edit and approve draft cards in the browser, one at a time.
 *
 *   npm run review        then open http://localhost:4321
 *
 * It runs only on your own computer: it listens on 127.0.0.1, refuses any other host name, and refuses changes
 * sent by pages on other sites. Every save goes through the same checks as the validator. It is never part of the
 * deployed game.
 */
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSES, LEVEL_LABELS } from "../shared/src/index.js";
import { deleteDraft, editCard, readDecks, writeDeck, type CardEdit, type Decks } from "../server/src/content/reviewStore.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decksDir = path.join(root, "content/decks");
const PORT = Number(process.env.REVIEW_PORT ?? 4321);
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

let decks: Decks = readDecks(decksDir);
const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  const host = req.headers.host ?? "";
  // A web page elsewhere could point a host name at this computer (DNS rebinding): only these names are accepted.
  if (!allowedHosts.has(host)) return void res.status(403).send("This tool only answers on localhost.");
  // Writes must come from this page, never from another site's page.
  if (req.method !== "GET" && req.headers.origin !== undefined && req.headers.origin !== `http://${host}`) {
    return void res.status(403).json({ ok: false, problems: ["refused: request from another site"] });
  }
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use("/fonts", express.static(path.join(root, "client/public/fonts")));
app.use("/katex", express.static(path.join(root, "node_modules/katex/dist")));
app.get("/", (_req, res) => res.sendFile(path.join(root, "scripts/review.html")));

app.get("/api/cards", (_req, res) => {
  decks = readDecks(decksDir); // pick up edits made in a text editor meanwhile
  res.json({ cards: [...decks.values()].flat(), courses: COURSES, levels: LEVEL_LABELS });
});

app.patch("/api/cards/:id", (req, res) => {
  const result = editCard(decks, req.params.id, req.body as CardEdit);
  if (result.ok) writeDeck(decksDir, result.file, decks.get(result.file)!);
  res.status(result.ok ? 200 : 422).json(result);
});

app.delete("/api/cards/:id", (req, res) => {
  const result = deleteDraft(decks, req.params.id);
  if (result.ok) writeDeck(decksDir, result.file, decks.get(result.file)!);
  res.status(result.ok ? 200 : 422).json(result);
});

app.listen(PORT, "127.0.0.1", () => {
  const drafts = [...decks.values()].flat().filter((c) => c.status === "draft").length;
  console.log(`Card review: http://localhost:${PORT}  (${drafts} drafts to review). Press Ctrl+C to stop.`);
});
