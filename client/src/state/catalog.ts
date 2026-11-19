import { topicKey, type Card, type Selection } from "@stemcharades/shared";

/** Playable cards per level, course and topic key: the numbers on the curriculum picker. */
export interface Counts {
  levels: Record<string, number>;
  courses: Record<string, number>;
  topics: Record<string, number>;
}
export interface Catalog extends Counts {
  /** Whether the AI is writing cards, so any part of the map can be chosen. */
  ai: boolean;
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

/** What the server can offer. Offline or asleep, it says "no AI" and no counts, and the game goes on. */
export async function fetchCatalog(): Promise<Catalog | null> {
  try {
    const res = await fetch("/api/catalog");
    return res.ok ? ((await res.json()) as Catalog) : null;
  } catch {
    return null;
  }
}

/** Ask the AI to start on a choice before anyone presses Start. Fire and forget. */
export function warmAi(selection: Selection): void {
  fetch("/api/ai/warm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ levels: selection.levels, courses: selection.courses, topics: selection.topics }),
  }).catch(() => undefined);
}

/** Report an AI-written card as wrong. Two people's reports take it out of the game. */
export async function flagAiCard(id: string): Promise<boolean> {
  try {
    return (await fetch(`/api/cards/${encodeURIComponent(id)}/flag`, { method: "POST" })).ok;
  } catch {
    return false;
  }
}
