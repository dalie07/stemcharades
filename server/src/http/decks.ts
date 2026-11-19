import express, { type Router } from "express";
import { LEVELS, SUBJECTS, topicKey, type Card } from "@stemcharades/shared";

/** Read-only deck routes. Party mode downloads whole decks so it can run offline on one device. */
export function decksRouter(cards: readonly Card[]): Router {
  const router = express.Router();

  router.get("/", (_req, res) => {
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
    res.json(cards.filter((c) => c.subject === subject));
  });

  return router;
}

/** Playable cards per level, course and topic key: the numbers behind the curriculum picker. */
export interface Catalog {
  levels: Record<string, number>;
  courses: Record<string, number>;
  topics: Record<string, number>;
}

export function buildCatalog(cards: readonly Card[]): Catalog {
  const catalog: Catalog = { levels: {}, courses: {}, topics: {} };
  const bump = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);
  for (const c of cards) {
    bump(catalog.levels, String(c.level));
    bump(catalog.courses, c.course);
    bump(catalog.topics, topicKey(c.course, c.topic));
  }
  return catalog;
}

/** What can be played, and how much of it. The cards never change while the server runs, so it is built once. */
export function catalogRouter(cards: readonly Card[]): Router {
  const router = express.Router();
  const catalog = buildCatalog(cards);
  router.get("/", (_req, res) => void res.json(catalog));
  return router;
}
