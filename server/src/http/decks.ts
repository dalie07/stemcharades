import express, { type Router } from "express";
import { LEVELS, SUBJECTS, type Card } from "@stemcharades/shared";

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
