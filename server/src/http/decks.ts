import { createHash } from "node:crypto";
import express, { type Router } from "express";
import { AI_CARD_PREFIX, LEVELS, SUBJECTS, selectionSchema, topicKey } from "@stemcharades/shared";
import type { CardBank, CardSource } from "../ai/cardBank.js";
import type { AiService } from "../ai/aiService.js";
import { limitKey, type Limits } from "../realtime/rateLimit.js";

/**
 * Read-only deck routes. Party mode downloads whole decks (the library plus any AI cards so far) so it can
 * run offline on one device.
 */
export function decksRouter(source: CardSource): Router {
  const router = express.Router();

  router.get("/", (_req, res) => {
    const cards = source.all();
    res.json(
      SUBJECTS.map((subject) => {
        const inSubject = cards.filter((c) => c.subject === subject);
        return {
          subject,
          count: inSubject.length,
          levels: LEVELS.map((level) => ({ level, count: inSubject.filter((c) => c.level === level).length })),
        };
      }),
    );
  });

  router.get("/:subject/cards", (req, res) => {
    const subject = SUBJECTS.find((s) => s.toLowerCase() === req.params.subject.toLowerCase());
    if (!subject) {
      res.status(404).json({ error: "unknown_subject" });
      return;
    }
    res.json(source.all().filter((c) => c.subject === subject));
  });

  return router;
}

export interface Catalog {
  /** Whether the AI is writing cards. When it is, any part of the curriculum map can be chosen. */
  ai: boolean;
  /** Playable cards per level, course and topic key. Missing means none. */
  levels: Record<string, number>;
  courses: Record<string, number>;
  topics: Record<string, number>;
}

/** What can be played, and how much of it: the counts behind the curriculum picker. */
export function catalogRouter(bank: CardBank, ai: AiService | undefined, limits: Limits): Router {
  const router = express.Router();
  // Parsers sit on their own routes: this router is mounted on /api and must not touch other routes' bodies.
  const json = express.json({ limit: "16kb" });

  router.get("/catalog", (_req, res) => {
    const catalog: Catalog = { ai: Boolean(ai?.usable()), levels: {}, courses: {}, topics: {} };
    const bump = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);
    for (const c of bank.all()) {
      bump(catalog.levels, String(c.level));
      bump(catalog.courses, c.course);
      bump(catalog.topics, topicKey(c.course, c.topic));
    }
    res.json(catalog);
  });

  // Someone is choosing what to play: start writing cards for it before they press Start.
  router.post("/ai/warm", json, (req, res) => {
    if (!limits.probe.take(limitKey(req.ip))) return void res.status(429).json({ error: "rate_limited" });
    const selection = selectionSchema.safeParse(req.body);
    if (!selection.success) return void res.status(400).json({ error: "invalid_payload" });
    res.status(202).json({ writing: ai ? ai.warm(selection.data) : false });
  });

  // A player reports an AI card as wrong. Two reports from different people retire it at once.
  router.post("/cards/:id/flag", (req, res) => {
    if (!limits.probe.take(limitKey(req.ip))) return void res.status(429).json({ error: "rate_limited" });
    const id = String(req.params.id);
    if (!id.startsWith(AI_CARD_PREFIX)) return void res.status(404).json({ error: "unknown_card" });
    // A one-way hash: enough to count each person once, without keeping their address.
    const reporter = createHash("sha256").update(`flag:${limitKey(req.ip)}`).digest("hex").slice(0, 16);
    const result = bank.flag(id, reporter);
    if (!result) return void res.status(404).json({ error: "unknown_card" });
    res.json(result);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: "invalid_payload" });
  });
  return router;
}
