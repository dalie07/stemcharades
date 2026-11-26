import { create } from "zustand";
import { topicKey } from "@stemcharades/shared";

/**
 * What this device has learned, kept in the browser so it works for guests and offline:
 * - each card's latest result, which drives mastery stars and the "revise my misses" deck,
 * - the days played, which drive the daily streak.
 * Nothing here leaves the device.
 */

export interface CardResult {
  topic: string; // topic key, e.g. "secondary-physics/Waves"
  got: number;
  missed: number;
  /** The latest result: a missed card stays "to revise" until it is got again. */
  last: "got" | "missed";
}

export interface Progress {
  cards: Record<string, CardResult>;
  /** ISO dates (YYYY-MM-DD) on which a game was played, newest last, at most a year's worth. */
  days: string[];
}

export const EMPTY: Progress = { cards: {}, days: [] };

export const today = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// ---- Pure rules (tested directly) ------------------------------------------------------------

export function withResult(p: Progress, card: { id: string; course: string; topic: string }, got: boolean): Progress {
  const before = p.cards[card.id];
  const result: CardResult = {
    topic: topicKey(card.course, card.topic),
    got: (before?.got ?? 0) + (got ? 1 : 0),
    missed: (before?.missed ?? 0) + (got ? 0 : 1),
    last: got ? "got" : "missed",
  };
  return { ...p, cards: { ...p.cards, [card.id]: result } };
}

export function withDayPlayed(p: Progress, day: string): Progress {
  if (p.days.at(-1) === day) return p;
  return { ...p, days: [...p.days.filter((d) => d !== day), day].slice(-366) };
}

const dayBefore = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return today(d);
};

/** Days in a row played, ending today, or yesterday (today's game may not have happened yet). */
export function streak(p: Progress, day: string): number {
  const played = new Set(p.days);
  let cursor = played.has(day) ? day : dayBefore(day);
  let n = 0;
  while (played.has(cursor)) {
    n++;
    cursor = dayBefore(cursor);
  }
  return n;
}

/** Cards whose latest result is a miss: the revision deck. */
export function missedIds(p: Progress): string[] {
  return Object.entries(p.cards)
    .filter(([, r]) => r.last === "missed")
    .map(([id]) => id);
}

/**
 * Stars for a topic, out of three: one for learning any card in it, two for half of them, three for all.
 * "Learned" means the latest result was a success, so a card missed again loses its credit until relearned.
 */
export function stars(p: Progress, topic: string, cardsInTopic: number): 0 | 1 | 2 | 3 {
  if (cardsInTopic === 0) return 0;
  const learned = Object.values(p.cards).filter((r) => r.topic === topic && r.last === "got").length;
  if (learned >= cardsInTopic) return 3;
  if (learned * 2 >= cardsInTopic) return 2;
  return learned > 0 ? 1 : 0;
}

// ---- The device's store ----------------------------------------------------------------------

const KEY = "stemcharades.progress";

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { cards: parsed.cards ?? {}, days: parsed.days ?? [] };
  } catch {
    return EMPTY;
  }
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: progress simply is not remembered */
  }
}

interface ProgressStore extends Progress {
  record: (card: { id: string; course: string; topic: string }, got: boolean) => void;
  played: () => void;
}

export const useProgress = create<ProgressStore>((set, get) => ({
  ...load(),
  record: (card, got) => {
    const next = withResult(get(), card, got);
    save(next);
    set(next);
  },
  played: () => {
    const next = withDayPlayed(get(), today());
    if (next === get()) return;
    save(next);
    set(next);
  },
}));
