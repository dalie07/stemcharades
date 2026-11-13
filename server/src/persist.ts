import { saveFinishedGame, type Db, type FinishedGame } from "./db/repo.js";
import type { Room } from "./game/roomManager.js";

const isCustom = (cardId: string) => cardId.startsWith("cus-");

/**
 * Turn a finished room into the small durable summary: the "result", kept apart from the live round.
 * Only signed-in players are stored; guests are never written down.
 */
export function snapshotFinished(room: Room): FinishedGame | null {
  const { history, scores } = room.game;
  if (history.length === 0) return null;

  // Competition ranking over everyone in the room, guests included, so a signed-in player's rank is honest.
  const ordered = [...room.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const rank = new Map<string, number>();
  ordered.forEach((p, i) => {
    const prev = ordered[i - 1];
    rank.set(p.id, prev && (scores[prev.id] ?? 0) === (scores[p.id] ?? 0) ? rank.get(prev.id)! : i + 1);
  });

  const signedIn = room.players.filter((p): p is typeof p & { userId: string } => Boolean(p.userId));
  const missed: FinishedGame["missed"] = [];
  const got: FinishedGame["got"] = [];
  for (const p of signedIn) {
    const missedIds = new Set<string>();
    const gotIds = new Set<string>();
    for (const r of history) {
      if (isCustom(r.cardId) || r.explainerId === p.id) continue; // explaining is not guessing
      (r.correct.includes(p.id) ? gotIds : missedIds).add(r.cardId);
    }
    missed.push({ userId: p.userId, cardIds: [...missedIds] });
    got.push({ userId: p.userId, cardIds: [...gotIds] });
  }

  return {
    roomSize: room.players.length,
    rounds: history.length,
    settings: { ...room.settings, customDeck: Boolean(room.customDeck) },
    players: signedIn.map((p) => ({ userId: p.userId, score: scores[p.id] ?? 0, rank: rank.get(p.id)! })),
    // Custom cards are private to their owner and have no permanent id, so they stay out of global statistics.
    cards: history
      .filter((r) => !isCustom(r.cardId))
      .map((r) => ({ cardId: r.cardId, guessed: r.correct.length > 0, secondsToGuess: r.fastestMs === null ? null : r.fastestMs / 1000 })),
    missed,
    got,
  };
}

/** The finished-game hook for the runner. With no database it does nothing: no live game depends on it. */
export function createPersistence(db: Db | undefined): ((room: Room) => void) | undefined {
  if (!db) return undefined;
  return (room) => {
    const snapshot = snapshotFinished(room);
    if (!snapshot) return;
    // Fire and forget: a slow or failing database must never delay or break the game.
    void saveFinishedGame(db, snapshot).catch((err) => console.error("could not save game result", err instanceof Error ? err.message : err));
  };
}
