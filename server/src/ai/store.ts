import { eq, sql } from "drizzle-orm";
import { cardSchema, topicKey, type Card } from "@stemcharades/shared";
import type { Db } from "../db/repo.js";
import { generatedCards } from "../db/schema.js";
import type { CardBank } from "./cardBank.js";

/** Keeps the AI's cards in Postgres so the bank survives restarts. Every call is best-effort. */
export interface AiCardStore {
  /** Put saved cards back in the bank. Retired ones come back too, so the same bad card is never rewritten. */
  restore(bank: CardBank): Promise<number>;
  save(cards: readonly Card[]): Promise<void>;
  /** Write play counts and reports that changed since last time. */
  flush(bank: CardBank): Promise<void>;
}

export function dbStore(db: Db): AiCardStore {
  return {
    async restore(bank) {
      const rows = await db.select().from(generatedCards);
      const cards: Card[] = [];
      const restored: { served: number; reporters: string[]; retired: boolean }[] = [];
      for (const row of rows) {
        // The curriculum map may have changed since the card was written: drop cards that no longer fit.
        const parsed = cardSchema.safeParse(row.card);
        if (!parsed.success) continue;
        cards.push(parsed.data);
        restored.push({ served: row.served, reporters: row.reporters, retired: row.retired });
      }
      return bank.add(cards, restored).added.length;
    },

    async save(cards) {
      if (!cards.length) return;
      await db
        .insert(generatedCards)
        .values(cards.map((card) => ({ id: card.id, topicKey: topicKey(card.course, card.topic), card })))
        .onConflictDoNothing();
    },

    async flush(bank) {
      for (const c of bank.drainChanged()) {
        await db
          .update(generatedCards)
          .set({ served: sql`GREATEST(${generatedCards.served}, ${c.served})`, reporters: c.reporters, retired: c.retired })
          .where(eq(generatedCards.id, c.id));
      }
    },
  };
}
