import { and, count, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { MAX_CARDS_PER_DECK, MAX_DECKS_PER_USER, type Card, type CustomCard } from "@stemcharades/shared";
import * as schema from "./schema.js";

/** Works with both node-postgres (production) and PGlite (tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
const { users, gameResults, playerResults, cardStats, missedCards, customDecks, customCards } = schema;

/** Custom cards have no permanent id of their own, so they are marked to keep them out of global statistics. */
export const CUSTOM_CARD_PREFIX = "cus-";

export interface User {
  id: string;
  displayName: string;
}

export async function upsertUser(db: Db, u: { provider: string; subject: string; displayName: string }): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({ oauthProvider: u.provider, oauthSubject: u.subject, displayName: u.displayName })
    .onConflictDoUpdate({ target: [users.oauthProvider, users.oauthSubject], set: { displayName: u.displayName } })
    .returning({ id: users.id, displayName: users.displayName });
  return row!;
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  const [row] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function deleteUser(db: Db, id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

// ---- Finished games ----------------------------------------------------------------------------

export interface FinishedGame {
  roomSize: number;
  rounds: number;
  settings: unknown;
  /** Signed-in players only. Guests are never stored. */
  players: { userId: string; score: number; rank: number }[];
  /** One entry per round played. Custom-deck cards are left out of the global statistics. */
  cards: { cardId: string; guessed: boolean; secondsToGuess: number | null }[];
  /** Per signed-in player: cards they missed, and cards they got (which clears an old miss). */
  missed: { userId: string; cardIds: string[] }[];
  got: { userId: string; cardIds: string[] }[];
}

export async function saveFinishedGame(db: Db, g: FinishedGame): Promise<string> {
  return db.transaction(async (tx) => {
    const [game] = await tx
      .insert(gameResults)
      .values({ roomSize: g.roomSize, rounds: g.rounds, settings: g.settings })
      .returning({ id: gameResults.id });
    const gameId = game!.id;

    if (g.players.length) {
      await tx
        .insert(playerResults)
        .values(g.players.map((p) => ({ gameResultId: gameId, userId: p.userId, score: p.score, rank: p.rank })));
    }

    for (const c of g.cards) {
      const guessedNow = c.guessed ? 1 : 0;
      const secs = c.secondsToGuess ?? 0;
      await tx
        .insert(cardStats)
        .values({ cardId: c.cardId, timesPlayed: 1, timesGuessed: guessedNow, avgSecondsToGuess: c.guessed ? secs : null })
        .onConflictDoUpdate({
          target: cardStats.cardId,
          set: {
            timesPlayed: sql`${cardStats.timesPlayed} + 1`,
            timesGuessed: sql`${cardStats.timesGuessed} + ${guessedNow}`,
            // Running average over the games where it was guessed.
            avgSecondsToGuess: c.guessed
              ? sql`(COALESCE(${cardStats.avgSecondsToGuess}, 0) * ${cardStats.timesGuessed} + ${secs}) / (${cardStats.timesGuessed} + 1)`
              : cardStats.avgSecondsToGuess,
          },
        });
    }

    for (const m of g.missed) {
      for (const cardId of m.cardIds) {
        await tx
          .insert(missedCards)
          .values({ userId: m.userId, cardId })
          .onConflictDoUpdate({ target: [missedCards.userId, missedCards.cardId], set: { lastMissedAt: sql`now()` } });
      }
    }
    for (const gt of g.got) {
      for (const cardId of gt.cardIds) {
        await tx.delete(missedCards).where(and(eq(missedCards.userId, gt.userId), eq(missedCards.cardId, cardId)));
      }
    }
    return gameId;
  });
}

export async function history(db: Db, userId: string, limit = 20) {
  return db
    .select({
      playedAt: gameResults.playedAt,
      score: playerResults.score,
      rank: playerResults.rank,
      roomSize: gameResults.roomSize,
      rounds: gameResults.rounds,
    })
    .from(playerResults)
    .innerJoin(gameResults, eq(gameResults.id, playerResults.gameResultId))
    .where(eq(playerResults.userId, userId))
    .orderBy(desc(gameResults.playedAt))
    .limit(limit);
}

export async function missedList(db: Db, userId: string, limit = 100) {
  return db
    .select({ cardId: missedCards.cardId, lastMissedAt: missedCards.lastMissedAt })
    .from(missedCards)
    .where(eq(missedCards.userId, userId))
    .orderBy(desc(missedCards.lastMissedAt))
    .limit(limit);
}

export async function statsFor(db: Db, cardId: string) {
  const [row] = await db.select().from(cardStats).where(eq(cardStats.cardId, cardId));
  return row ?? null;
}

// ---- Private custom decks ----------------------------------------------------------------------
// Every query below is scoped by owner: a deck that is not yours behaves exactly like one that does not exist.

export type DeckError = "limit" | "not_found";

const ownedDeck = (ownerId: string, deckId: string) => and(eq(customDecks.id, deckId), eq(customDecks.ownerId, ownerId));

async function findOwnedDeck(db: Db, ownerId: string, deckId: string): Promise<{ id: string; name: string } | null> {
  const [deck] = await db
    .select({ id: customDecks.id, name: customDecks.name })
    .from(customDecks)
    .where(ownedDeck(ownerId, deckId));
  return deck ?? null;
}

export async function createDeck(db: Db, ownerId: string, name: string): Promise<{ id: string; name: string } | DeckError> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(customDecks).where(eq(customDecks.ownerId, ownerId));
  if (n >= MAX_DECKS_PER_USER) return "limit";
  const [row] = await db
    .insert(customDecks)
    .values({ ownerId, name })
    .returning({ id: customDecks.id, name: customDecks.name });
  return row!;
}

export async function listDecks(db: Db, ownerId: string) {
  return db
    .select({ id: customDecks.id, name: customDecks.name, createdAt: customDecks.createdAt, cards: count(customCards.id) })
    .from(customDecks)
    .leftJoin(customCards, eq(customCards.deckId, customDecks.id))
    .where(eq(customDecks.ownerId, ownerId))
    .groupBy(customDecks.id)
    .orderBy(desc(customDecks.createdAt));
}

/** A deck with its cards in the shape the game engine plays. Custom card ids are prefixed "cus-". */
export async function getDeck(db: Db, ownerId: string, deckId: string): Promise<{ id: string; name: string; cards: Card[] } | null> {
  const deck = await findOwnedDeck(db, ownerId, deckId);
  if (!deck) return null;
  const rows = await db.select().from(customCards).where(eq(customCards.deckId, deckId)).orderBy(customCards.createdAt);
  return {
    ...deck,
    cards: rows.map(
      (r): Card => ({
        id: `${CUSTOM_CARD_PREFIX}${r.id}`,
        type: r.type as Card["type"],
        subject: r.subject as Card["subject"],
        topic: r.topic,
        level: r.level as Card["level"],
        prompt: r.prompt,
        ...(r.latex ? { latex: r.latex } : {}),
        answers: r.answers,
        forbidden: r.forbidden,
        explanation: r.explanation,
        status: "reviewed", // the owner wrote it for their own group: the review gate is for the built-in decks
      }),
    ),
  };
}

export async function addCard(db: Db, ownerId: string, deckId: string, card: CustomCard): Promise<{ id: string } | DeckError> {
  if (!(await findOwnedDeck(db, ownerId, deckId))) return "not_found";
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(customCards).where(eq(customCards.deckId, deckId));
  if (n >= MAX_CARDS_PER_DECK) return "limit";
  const [row] = await db
    .insert(customCards)
    .values({ deckId, ...card, latex: card.latex ?? null })
    .returning({ id: customCards.id });
  return { id: `${CUSTOM_CARD_PREFIX}${row!.id}` };
}

export async function deleteCard(db: Db, ownerId: string, deckId: string, cardId: string): Promise<boolean> {
  if (!(await findOwnedDeck(db, ownerId, deckId))) return false;
  const rawId = cardId.startsWith(CUSTOM_CARD_PREFIX) ? cardId.slice(CUSTOM_CARD_PREFIX.length) : cardId;
  const gone = await db
    .delete(customCards)
    .where(and(eq(customCards.id, rawId), eq(customCards.deckId, deckId)))
    .returning({ id: customCards.id });
  return gone.length > 0;
}

export async function deleteDeck(db: Db, ownerId: string, deckId: string): Promise<boolean> {
  const gone = await db.delete(customDecks).where(ownedDeck(ownerId, deckId)).returning({ id: customDecks.id });
  return gone.length > 0;
}
