import type { Card } from "./schemas.js";
import { inSelection, type Selection } from "./taxonomy.js";

export interface Pick {
  card: Card;
  usedIds: string[];
}

/**
 * Draw an unused card from the pool. When the pool is exhausted it reshuffles
 * (clears the used list) and never repeats the card just played.
 */
export function pickCard(
  pool: readonly Card[],
  usedIds: readonly string[],
  rng: () => number = Math.random,
  lastId?: string,
): Pick {
  if (pool.length === 0) throw new Error("empty card pool");
  let used = new Set(usedIds);
  let candidates = pool.filter((c) => !used.has(c.id));
  if (candidates.length === 0) {
    used = new Set();
    candidates = pool.length > 1 ? pool.filter((c) => c.id !== lastId) : [...pool];
  }
  const index = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  const card = candidates[index]!;
  used.add(card.id);
  return { card, usedIds: [...used] };
}

/** The cards inside a selection (see `inSelection`). An empty selection is General: every card. */
export function filterCards(cards: readonly Card[], s: Selection): Card[] {
  return cards.filter((c) => inSelection(c, s));
}
