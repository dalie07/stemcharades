import { topicKey, type Card } from "@stemcharades/shared";

/** Playable cards per level, course and topic key: the numbers on the curriculum picker. */
export interface Counts {
  levels: Record<string, number>;
  courses: Record<string, number>;
  topics: Record<string, number>;
}

export const NO_COUNTS: Counts = { levels: {}, courses: {}, topics: {} };

/** Count a list of cards the same way the server's catalog does, e.g. for Party mode's downloaded decks. */
export function countCards(cards: readonly Card[]): Counts {
  const counts: Counts = { levels: {}, courses: {}, topics: {} };
  const bump = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);
  for (const c of cards) {
    bump(counts.levels, String(c.level));
    bump(counts.courses, c.course);
    bump(counts.topics, topicKey(c.course, c.topic));
  }
  return counts;
}

/** The server's card counts. Offline or asleep it returns null, and the picker simply shows no numbers. */
export async function fetchCatalog(): Promise<Counts | null> {
  try {
    const res = await fetch("/api/catalog");
    return res.ok ? ((await res.json()) as Counts) : null;
  } catch {
    return null;
  }
}
