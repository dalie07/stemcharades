import { normalise, topicKey, type Card } from "@stemcharades/shared";

/** Where games get their cards: the reviewed library plus, when the AI is on, the cards it has written. */
export interface CardSource {
  /** Every card that may be dealt now. Retired AI cards are left out. */
  all(): readonly Card[];
  /** Any card by id, retired ones included, so a round already under way can always finish. */
  get(id: string): Card | undefined;
  /** Told whenever a card is dealt in an online round. */
  served?(id: string): void;
}

export const staticSource = (cards: readonly Card[]): CardSource => {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return { all: () => cards, get: (id) => byId.get(id) };
};

/** Two distinct players' reports retire an AI card. One mistaken or mischievous report is not enough. */
export const FLAGS_TO_RETIRE = 2;

interface Entry {
  card: Card;
  served: number;
  reporters: Set<string>;
  retired: boolean;
}

export type AddResult = { added: Card[]; rejected: { card: Card; reason: string }[] };

/**
 * The library and the AI's cards in one place. Accepted AI cards never repeat a prompt or share an accepted
 * answer with any other card, so the guess matcher stays unambiguous and players do not see the same card
 * twice under different ids.
 */
export class CardBank implements CardSource {
  private library: readonly Card[];
  private libraryById: Map<string, Card>;
  private ai = new Map<string, Entry>();
  private answerOwner = new Map<string, string>();
  private promptsByTopic = new Map<string, string[]>();
  private active: Card[] | null = null;
  private topicCounts: Map<string, number> | null = null;
  /** AI cards whose play count or reports changed since `drainChanged` was last called. */
  private dirty = new Set<string>();

  constructor(library: readonly Card[]) {
    this.library = library;
    this.libraryById = new Map(library.map((c) => [c.id, c]));
    for (const c of library) this.index(c);
  }

  private index(card: Card) {
    for (const a of card.answers) {
      const key = normalise(a);
      if (!this.answerOwner.has(key)) this.answerOwner.set(key, card.id);
    }
    const topic = topicKey(card.course, card.topic);
    const prompts = this.promptsByTopic.get(topic) ?? [];
    prompts.push(card.prompt);
    this.promptsByTopic.set(topic, prompts);
  }

  all(): readonly Card[] {
    this.active ??= [...this.library, ...[...this.ai.values()].filter((e) => !e.retired).map((e) => e.card)];
    return this.active;
  }

  private changed() {
    this.active = null;
    this.topicCounts = null;
  }

  get(id: string): Card | undefined {
    return this.libraryById.get(id) ?? this.ai.get(id)?.card;
  }

  served(id: string): void {
    const entry = this.ai.get(id);
    if (!entry) return;
    entry.served++;
    this.dirty.add(id);
  }

  /** The AI cards changed since last asked, with their current counts, for saving. */
  drainChanged(): { id: string; served: number; reporters: string[]; retired: boolean }[] {
    const out = [...this.dirty].flatMap((id) => {
      const snap = this.snapshot(id);
      return snap ? [{ id, ...snap }] : [];
    });
    this.dirty.clear();
    return out;
  }

  /** Why a new card would clash with one already in the game, or null if it is new. */
  clash(card: Card): string | null {
    if (this.get(card.id)) return "duplicate id";
    const prompt = normalise(card.prompt);
    const sameTopic = this.promptsByTopic.get(topicKey(card.course, card.topic)) ?? [];
    if (sameTopic.some((p) => normalise(p) === prompt)) return "repeats a prompt";
    for (const a of card.answers) {
      const owner = this.answerOwner.get(normalise(a));
      if (owner) return `answer "${a}" belongs to ${owner}`;
    }
    return null;
  }

  /** Add AI cards that pass the clash check. Cards restored from storage keep their play and report counts. */
  add(cards: readonly Card[], restored: { served?: number; reporters?: string[]; retired?: boolean }[] = []): AddResult {
    const result: AddResult = { added: [], rejected: [] };
    cards.forEach((card, i) => {
      const reason = this.clash(card);
      if (reason) return void result.rejected.push({ card, reason });
      const r = restored[i] ?? {};
      this.ai.set(card.id, { card, served: r.served ?? 0, reporters: new Set(r.reporters ?? []), retired: r.retired ?? false });
      this.index(card);
      result.added.push(card);
    });
    if (result.added.length) this.changed();
    return result;
  }

  /**
   * A player reports an AI card as wrong. `reporter` identifies the person without naming them (a hash), so
   * one person reporting twice counts once. Returns null for cards that are not AI cards (library cards are
   * corrected by people, through the issue tracker), otherwise whether it is now retired.
   */
  flag(id: string, reporter: string): { retired: boolean } | null {
    const entry = this.ai.get(id);
    if (!entry) return null;
    entry.reporters.add(reporter);
    this.dirty.add(id);
    if (!entry.retired && entry.reporters.size >= FLAGS_TO_RETIRE) {
      entry.retired = true;
      this.changed();
    }
    return { retired: entry.retired };
  }

  /** The prompts already used in a topic, so the AI can be told not to repeat them. Most recent last. */
  promptsIn(topic: string): readonly string[] {
    return this.promptsByTopic.get(topic) ?? [];
  }

  /** Live (not retired) AI cards in a topic, and how often they have been dealt on average. */
  aiStats(topic: string): { count: number; avgServed: number } {
    let count = 0;
    let served = 0;
    for (const e of this.ai.values()) {
      if (e.retired || topicKey(e.card.course, e.card.topic) !== topic) continue;
      count++;
      served += e.served;
    }
    return { count, avgServed: count ? served / count : 0 };
  }

  /** Cards of any origin that can be dealt in a topic. */
  countIn(topic: string): number {
    if (!this.topicCounts) {
      this.topicCounts = new Map();
      for (const c of this.all()) {
        const key = topicKey(c.course, c.topic);
        this.topicCounts.set(key, (this.topicCounts.get(key) ?? 0) + 1);
      }
    }
    return this.topicCounts.get(topic) ?? 0;
  }

  snapshot(id: string): { served: number; reporters: string[]; retired: boolean } | undefined {
    const e = this.ai.get(id);
    return e && { served: e.served, reporters: [...e.reporters], retired: e.retired };
  }

  get aiCount(): number {
    return this.ai.size;
  }
}
