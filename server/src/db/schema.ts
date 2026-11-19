import { index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Durable tables (Neon Postgres). Live rooms and rounds are never stored here: only the small summary
 * of a finished game. Guests have no user row, and a game can be saved with no signed-in players at all.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    oauthProvider: text("oauth_provider").notNull(),
    oauthSubject: text("oauth_subject").notNull(),
    /** A display name only (GitHub username or Google first name). No email or password is stored. */
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_oauth_idx").on(t.oauthProvider, t.oauthSubject)],
);

export const gameResults = pgTable("game_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  roomSize: integer("room_size").notNull(),
  rounds: integer("rounds").notNull(),
  settings: jsonb("settings").notNull(),
});

export const playerResults = pgTable(
  "player_results",
  {
    gameResultId: uuid("game_result_id").notNull().references(() => gameResults.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameResultId, t.userId] }), index("player_results_user_idx").on(t.userId)],
);

/** Shows which cards are too hard or broken. Card ids are permanent, so stats survive edits to wording. */
export const cardStats = pgTable("card_stats", {
  cardId: text("card_id").primaryKey(),
  timesPlayed: integer("times_played").notNull().default(0),
  timesGuessed: integer("times_guessed").notNull().default(0),
  avgSecondsToGuess: real("avg_seconds_to_guess"),
});

/** Feeds the personal revision list. */
export const missedCards = pgTable(
  "missed_cards",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    lastMissedAt: timestamp("last_missed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);

export const customDecks = pgTable(
  "custom_decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    visibility: text("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_decks_owner_idx").on(t.ownerId)],
);

export const customCards = pgTable(
  "custom_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id").notNull().references(() => customDecks.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    subject: text("subject").notNull(),
    topic: text("topic").notNull(),
    level: integer("level").notNull(),
    prompt: text("prompt").notNull(),
    latex: text("latex"),
    answers: jsonb("answers").$type<string[]>().notNull(),
    forbidden: jsonb("forbidden").$type<string[]>().notNull(),
    explanation: text("explanation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_cards_deck_idx").on(t.deckId)],
);
