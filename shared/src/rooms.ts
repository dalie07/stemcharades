import { z } from "zod";
import { SUBJECTS } from "./schemas.js";

/** 32 characters, no look-alikes (no I, O, 0, 1): 32^5 ≈ 33 million codes. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;
export const MAX_PLAYERS_PER_ROOM = 12;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), "invalid room code");

export const nicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[\p{L}\p{N} _.'-]+$/u, "letters, numbers, spaces and _ . ' - only");

export const sessionTokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

export const settingsSchema = z
  .object({
    subjects: z.array(z.enum(SUBJECTS)).min(1).max(SUBJECTS.length),
    levels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).min(1).max(3),
    roundSeconds: z.union([z.literal(60), z.literal(90)]),
    rounds: z.number().int().min(1).max(10),
  })
  .strict();
export type RoomSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  subjects: [...SUBJECTS],
  levels: [1, 2, 3],
  roundSeconds: 60,
  rounds: 3,
};

// ---- REST bodies -----------------------------------------------------------
export const createRoomBodySchema = z.object({ nickname: nicknameSchema }).strict();
export type CreateRoomResponse = { code: string; playerId: string; sessionToken: string };
export type RoomStatusResponse = { exists: boolean; joinable: boolean; players: number };

// ---- Socket payloads (client -> server) ------------------------------------
export const joinPayloadSchema = z
  .object({
    code: roomCodeSchema,
    nickname: nicknameSchema.optional(),
    sessionToken: sessionTokenSchema.optional(),
  })
  .strict()
  .refine((p) => p.nickname !== undefined || p.sessionToken !== undefined, {
    message: "nickname or sessionToken required",
  });
export type JoinPayload = z.infer<typeof joinPayloadSchema>;

// ---- Errors ----------------------------------------------------------------
export const ERROR_CODES = [
  "unknown_room",
  "room_full",
  "nickname_taken",
  "not_host",
  "not_in_room",
  "out_of_turn",
  "invalid_payload",
  "rate_limited",
  "server_full",
  "bad_session",
  "not_enough_players",
  "no_cards",
  "blocked_content",
  "kicked",
  "unauthorized",
  "unknown_deck",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unknown_room: "That room doesn't exist (it may have expired).",
  room_full: "That room is full.",
  nickname_taken: "Someone in the room already has that nickname.",
  not_host: "Only the host can do that.",
  not_in_room: "You are not in a room.",
  out_of_turn: "That isn't allowed right now.",
  invalid_payload: "That request wasn't valid.",
  rate_limited: "Slow down a little.",
  server_full: "The server is busy. Try again in a few minutes.",
  bad_session: "Your seat could not be restored.",
  not_enough_players: "You need at least two connected players to start.",
  no_cards: "No cards match these settings. Pick more subjects or levels.",
  blocked_content: "Please choose a different, friendlier name.",
  kicked: "The host removed you from the room.",
  unauthorized: "Sign in to do that.",
  unknown_deck: "That deck doesn't exist or isn't yours.",
};

// ---- Clues -----------------------------------------------------------------
export const MAX_CLUE_LENGTH = 140;
export const clueSchema = z.object({ text: z.string().trim().min(1).max(MAX_CLUE_LENGTH) }).strict();
export type CluePayload = z.infer<typeof clueSchema>;
export interface ClueRejection {
  reason: "contains_answer" | "forbidden_word" | "inappropriate";
  /** The offending card word. Empty for "inappropriate": the word is never echoed back. */
  word: string;
}

export const kickPayloadSchema = z.object({ playerId: z.string().uuid() }).strict();
export type KickPayload = z.infer<typeof kickPayloadSchema>;

// ---- Custom decks ------------------------------------------------------------
export const deckSelectPayloadSchema = z.object({ deckId: z.string().uuid().nullable() }).strict();
export type DeckSelectPayload = z.infer<typeof deckSelectPayloadSchema>;
export const MAX_DECKS_PER_USER = 20;
export const MAX_CARDS_PER_DECK = 200;
export const deckNameSchema = z.string().trim().min(1).max(60);

// ---- Guesses ---------------------------------------------------------------
export const MAX_GUESS_LENGTH = 100;
export const guessSchema = z.object({ text: z.string().trim().min(1).max(MAX_GUESS_LENGTH) }).strict();
export type GuessPayload = z.infer<typeof guessSchema>;
export type GuessResult = "correct" | "close" | "wrong";
/** Sent to the guesser alone. Never contains the answer. */
export interface GuessResultPayload {
  result: GuessResult;
  guess: string;
}

// ---- Server -> client views ------------------------------------------------
export interface PlayerView {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  score: number;
}
export type RoomPhase = "lobby" | "round" | "reveal" | "finished";
export type RoundOutcome = "timeout" | "skipped" | "explainer_left" | "all_guessed";

/** What every player may see about the current card. */
export interface PublicCardView {
  type: "term" | "formula" | "question";
  subject: string;
}
/** What only the explainer sees. Never includes the accepted answers or the explanation. */
export interface ExplainerCardView extends PublicCardView {
  topic: string;
  level: 1 | 2 | 3;
  prompt: string;
  latex?: string;
  forbidden: string[];
}
export interface RoundView {
  number: number;
  totalRounds: number;
  explainerId: string;
  endsAt: number;
  /** Server clock at send time, so clients can correct for clock skew. */
  serverNow: number;
  clues: { id: number; text: string }[];
  /** Ids of players who have guessed it. Public: everyone sees who got it, never the answer. */
  guessedCorrect: string[];
  card: PublicCardView;
  /** Present only in the explainer's own view. */
  explainerCard?: ExplainerCardView;
}
/** Sent to everyone only once the round is over. */
export interface RevealView {
  outcome: RoundOutcome;
  cardId: string;
  subject: string;
  topic: string;
  prompt: string;
  latex?: string;
  answers: string[];
  explanation: string;
  /** When the next round (or the end of the game) begins. */
  nextAt: number;
  /** Points each player earned this round. */
  awards: { playerId: string; points: number }[];
}
export interface MissedCardView {
  id: string;
  subject: string;
  topic: string;
  prompt: string;
  latex?: string;
  answers: string[];
  explanation: string;
}
export interface SummaryView {
  standings: { rank: number; playerId: string; nickname: string; score: number }[];
  /** Cards nobody in the room guessed, for revision. */
  missed: MissedCardView[];
}
export interface RoomView {
  code: string;
  hostId: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerView[];
  round?: RoundView;
  reveal?: RevealView;
  /** Present once the game has finished. */
  summary?: SummaryView;
  /** The host's private custom deck, when one is in use instead of the built-in cards. */
  customDeck?: { name: string; count: number };
}
export type JoinAck =
  | { ok: true; playerId: string; sessionToken?: string }
  | { ok: false; error: ErrorCode };
export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}
