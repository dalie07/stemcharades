import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { z } from "zod";
import { customCardSchema, deckNameSchema, type Card, type CustomCard } from "@stemcharades/shared";
import { SESSION_COOKIE, setCookie, userIdFromCookies } from "../auth/session.js";
import type { Provider } from "../auth/providers.js";
import { isBlocked } from "../game/blocklist.js";
import * as repo from "../db/repo.js";
import { limitKey, type Limits } from "../realtime/rateLimit.js";

export interface MeDeps {
  db?: repo.Db;
  secret?: string;
  providers: Provider[];
  /** Built-in cards, to turn missed card ids back into cards. */
  cardsById: ReadonlyMap<string, Card>;
  limits: Limits;
}

const idParam = z.string().uuid();
/** Everything on a custom card that other players will read, for the blocklist check. */
const customText = (c: CustomCard) => [c.prompt, c.topic, c.explanation, ...c.answers, ...c.forbidden].join(" ");

/** The signed-in user's own data. Guests are unaffected: nothing here is needed to play. */
export function meRouter(d: MeDeps): Router {
  const router = express.Router();
  router.use(express.json({ limit: "8kb" }));
  const authEnabled = Boolean(d.db && d.secret && d.providers.length);

  // Public: tells the client whether sign-in exists, and who (if anyone) is signed in.
  router.get("/", async (req, res) => {
    if (!authEnabled) return void res.json({ authEnabled: false, providers: [], user: null });
    const uid = userIdFromCookies(req.headers.cookie, d.secret);
    const user = uid ? await repo.getUser(d.db!, uid) : null;
    res.json({ authEnabled: true, providers: d.providers.map((p) => ({ id: p.id, label: p.label })), user });
  });

  const requireUser = async (req: Request, res: Response, next: NextFunction) => {
    if (!authEnabled) return void res.status(404).json({ error: "auth_disabled" });
    if (!d.limits.probe.take(limitKey(req.ip))) return void res.status(429).json({ error: "rate_limited" });
    const uid = userIdFromCookies(req.headers.cookie, d.secret);
    const user = uid ? await repo.getUser(d.db!, uid) : null;
    if (!user) return void res.status(401).json({ error: "unauthorized" });
    res.locals.user = user;
    next();
  };
  // Express 4 does not catch rejected promises, so every async handler is wrapped.
  const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
  const me = (res: Response) => res.locals.user as repo.User;

  // Erase the account and everything stored with it (results, revision list, decks). Cannot be undone.
  router.delete("/", requireUser, h(async (req, res) => {
    await repo.deleteUser(d.db!, me(res).id);
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.setHeader("Set-Cookie", setCookie(SESSION_COOKIE, "", { maxAgeS: 0, secure }));
    res.status(204).end();
  }));

  router.get("/history", requireUser, h(async (_req, res) => void res.json(await repo.history(d.db!, me(res).id))));

  router.get("/missed-cards", requireUser, h(async (_req, res) => {
    const rows = await repo.missedList(d.db!, me(res).id);
    const cards = rows.flatMap((r) => {
      const card = d.cardsById.get(r.cardId);
      return card ? [{ ...card, lastMissedAt: r.lastMissedAt }] : [];
    });
    res.json(cards);
  }));

  router.get("/decks", requireUser, h(async (_req, res) => void res.json(await repo.listDecks(d.db!, me(res).id))));

  router.post("/decks", requireUser, h(async (req, res) => {
    const name = deckNameSchema.safeParse(req.body?.name);
    if (!name.success) return void res.status(400).json({ error: "invalid_payload" });
    if (isBlocked(name.data)) return void res.status(400).json({ error: "blocked_content" });
    const deck = await repo.createDeck(d.db!, me(res).id, name.data);
    if (deck === "limit") return void res.status(409).json({ error: "deck_limit" });
    res.status(201).json(deck);
  }));

  router.get("/decks/:id", requireUser, h(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const deck = id.success ? await repo.getDeck(d.db!, me(res).id, id.data) : null;
    if (!deck) return void res.status(404).json({ error: "unknown_deck" });
    res.json(deck);
  }));

  router.delete("/decks/:id", requireUser, h(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success || !(await repo.deleteDeck(d.db!, me(res).id, id.data))) return void res.status(404).json({ error: "unknown_deck" });
    res.status(204).end();
  }));

  router.post("/decks/:id/cards", requireUser, h(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const card = customCardSchema.safeParse(req.body);
    if (!id.success || !card.success) return void res.status(400).json({ error: "invalid_payload" });
    if (isBlocked(customText(card.data))) return void res.status(400).json({ error: "blocked_content" });
    const added = await repo.addCard(d.db!, me(res).id, id.data, card.data);
    if (added === "not_found") return void res.status(404).json({ error: "unknown_deck" });
    if (added === "limit") return void res.status(409).json({ error: "card_limit" });
    res.status(201).json(added);
  }));

  router.delete("/decks/:id/cards/:cardId", requireUser, h(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const cardId = idParam.safeParse(String(req.params.cardId).replace(repo.CUSTOM_CARD_PREFIX, ""));
    if (!id.success || !cardId.success || !(await repo.deleteCard(d.db!, me(res).id, id.data, cardId.data))) {
      return void res.status(404).json({ error: "unknown_card" });
    }
    res.status(204).end();
  }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: "invalid_payload" });
  });
  return router;
}
