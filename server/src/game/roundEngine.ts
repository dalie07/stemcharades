import {
  explainerPoints,
  filterCards,
  guesserPoints,
  pickCard,
  type Card,
  type ClueRejection,
  type ErrorCode,
  type GuessResult,
  type RoomPhase,
  type RoomSettings,
  type RoundOutcome,
} from "@stemcharades/shared";
import { EXPLAINER_GRACE_MS } from "../config.js";
import { isBlocked } from "./blocklist.js";
import { checkClue } from "./clueFilter.js";
import { matchGuess } from "./guessMatcher.js";

/** Pause on the reveal screen before the next round starts. */
export const REVEAL_MS = 8000;
export const MAX_CLUES_PER_ROUND = 30;
export const MAX_GUESSES_PER_ROUND = 30;

export interface Clue {
  id: number;
  text: string;
}
export interface Round {
  number: number;
  explainerId: string;
  /** The card is looked up by id: card, round and result stay separate things. */
  cardId: string;
  startedAt: number;
  endsAt: number;
  clues: Clue[];
  /** Players who guessed it, in order, with the points they earned. */
  correct: { playerId: string; elapsedMs: number; points: number }[];
  /** Guesses made per player this round, to cap floods. */
  guessCounts: Record<string, number>;
  outcome: RoundOutcome | null;
}
/** The small durable record of a finished round (the "result"; the live Round may vanish). */
export interface RoundRecord {
  number: number;
  cardId: string;
  explainerId: string;
  outcome: RoundOutcome;
  correct: string[];
  /** Milliseconds to the first correct guess, or null if nobody got it. */
  fastestMs: number | null;
}
export interface Game {
  phase: RoomPhase;
  round: Round | null;
  usedCardIds: string[];
  /**
   * Who has explained in the current cycle. Tracking ids rather than a seat index keeps the order fair when
   * players leave (nobody is skipped) or join (they take a turn at the end of this cycle).
   */
  explained: string[];
  roundNumber: number;
  revealEndsAt: number | null;
  scores: Record<string, number>;
  history: RoundRecord[];
}

/** Everything the engine may know about the outside world, passed in so it stays pure. */
export interface Ctx {
  now: number;
  rng: () => number;
  settings: RoomSettings;
  /** In seating order. */
  players: { id: string; connected: boolean; disconnectedAt?: number }[];
  hostId: string;
  /** Cards matching the room's filters. */
  pool: readonly Card[];
  getCard: (id: string) => Card | undefined;
}

export type GameEvent =
  | { type: "start"; playerId: string }
  | { type: "clue"; playerId: string; text: string }
  | { type: "skip"; playerId: string }
  | { type: "guess"; playerId: string; text: string }
  | { type: "tick" }
  /** `ctx.players` must already exclude the player who left. */
  | { type: "playerLeft"; playerId: string };

export type Effect =
  | { type: "clueRejected"; playerId: string; rejection: ClueRejection }
  | { type: "guessResult"; playerId: string; result: GuessResult };
export type Step = { ok: true; game: Game; effects: Effect[] } | { ok: false; error: ErrorCode };

export const newGame = (): Game => ({
  phase: "lobby",
  round: null,
  usedCardIds: [],
  explained: [],
  roundNumber: 0,
  revealEndsAt: null,
  scores: {},
  history: [],
});

const ok = (game: Game, effects: Effect[] = []): Step => ({ ok: true, game, effects });
const fail = (error: ErrorCode): Step => ({ ok: false, error });

function chooseExplainer(game: Game, ctx: Ctx): { id: string; explained: string[] } {
  const due = ctx.players.find((p) => p.connected && !game.explained.includes(p.id));
  if (due) return { id: due.id, explained: [...game.explained, due.id] };
  // Everyone present has had a turn: a new cycle starts from the first seat.
  const first = ctx.players.find((p) => p.connected) ?? ctx.players[0]!;
  return { id: first.id, explained: [first.id] };
}

function beginRound(game: Game, ctx: Ctx): Game {
  const pick = pickCard(ctx.pool, game.usedCardIds, ctx.rng, game.round?.cardId);
  const explainer = chooseExplainer(game, ctx);
  const number = game.roundNumber + 1;
  return {
    ...game,
    phase: "round",
    usedCardIds: pick.usedIds,
    explained: explainer.explained,
    roundNumber: number,
    revealEndsAt: null,
    round: {
      number,
      explainerId: explainer.id,
      cardId: pick.card.id,
      startedAt: ctx.now,
      endsAt: ctx.now + ctx.settings.roundSeconds * 1000,
      clues: [],
      correct: [],
      guessCounts: {},
      outcome: null,
    },
  };
}

/** Every connected guesser has it (and at least one has). */
function allGuessed(game: Game, ctx: Ctx): boolean {
  const round = game.round;
  if (!round || round.correct.length === 0) return false;
  const got = new Set(round.correct.map((c) => c.playerId));
  return ctx.players.every((p) => p.id === round.explainerId || !p.connected || got.has(p.id));
}

function endRound(game: Game, outcome: RoundOutcome, ctx: Ctx): Game {
  const round = game.round!;
  return {
    ...game,
    phase: "reveal",
    revealEndsAt: ctx.now + REVEAL_MS,
    round: { ...round, outcome },
    history: [
      ...game.history,
      {
        number: round.number,
        cardId: round.cardId,
        explainerId: round.explainerId,
        outcome,
        correct: round.correct.map((c) => c.playerId),
        fastestMs: round.correct.length ? Math.min(...round.correct.map((c) => c.elapsedMs)) : null,
      },
    ],
  };
}

/** The whole rule set: current state plus one event in, new state plus messages out. No sockets, no clock. */
export function step(game: Game, event: GameEvent, ctx: Ctx): Step {
  switch (event.type) {
    case "start": {
      if (game.phase === "round" || game.phase === "reveal") return fail("out_of_turn");
      if (event.playerId !== ctx.hostId) return fail("not_host");
      if (ctx.players.filter((p) => p.connected).length < 2) return fail("not_enough_players");
      const pool = filterCards(ctx.pool, ctx.settings);
      if (pool.length === 0) return fail("no_cards");
      return ok(beginRound(newGame(), { ...ctx, pool }));
    }

    case "clue": {
      if (game.phase !== "round" || !game.round) return fail("out_of_turn");
      if (event.playerId !== game.round.explainerId || ctx.now >= game.round.endsAt) return fail("out_of_turn");
      const text = event.text.trim();
      if (!text) return fail("invalid_payload");
      if (game.round.clues.length >= MAX_CLUES_PER_ROUND) return fail("rate_limited");
      const card = ctx.getCard(game.round.cardId);
      if (!card) return fail("out_of_turn");
      if (isBlocked(text)) {
        return ok(game, [{ type: "clueRejected", playerId: event.playerId, rejection: { reason: "inappropriate", word: "" } }]);
      }
      const check = checkClue(text, card);
      if (!check.ok) {
        // Never stored, never broadcast: only the explainer learns why.
        return ok(game, [{ type: "clueRejected", playerId: event.playerId, rejection: { reason: check.reason, word: check.word } }]);
      }
      const clue: Clue = { id: game.round.clues.length + 1, text };
      return ok({ ...game, round: { ...game.round, clues: [...game.round.clues, clue] } });
    }

    case "skip": {
      if (game.phase !== "round" || !game.round) return fail("out_of_turn");
      if (event.playerId !== game.round.explainerId || ctx.now >= game.round.endsAt) return fail("out_of_turn");
      return ok(endRound(game, "skipped", ctx));
    }

    case "guess": {
      if (game.phase !== "round" || !game.round) return fail("out_of_turn");
      const round = game.round;
      // The explainer can never guess; nobody can guess once time is up or after they already got it.
      if (event.playerId === round.explainerId || ctx.now >= round.endsAt) return fail("out_of_turn");
      if (!ctx.players.some((p) => p.id === event.playerId)) return fail("not_in_room");
      if (round.correct.some((c) => c.playerId === event.playerId)) return fail("out_of_turn");
      const text = event.text.trim();
      if (!text) return fail("invalid_payload");
      const count = round.guessCounts[event.playerId] ?? 0;
      if (count >= MAX_GUESSES_PER_ROUND) return fail("rate_limited");
      const card = ctx.getCard(round.cardId);
      if (!card) return fail("out_of_turn");

      const result = matchGuess(text, card);
      let next: Game = {
        ...game,
        round: { ...round, guessCounts: { ...round.guessCounts, [event.playerId]: count + 1 } },
      };
      if (result === "correct") {
        const elapsedMs = ctx.now - round.startedAt;
        const points = guesserPoints(elapsedMs, round.endsAt - round.startedAt);
        const scores = { ...game.scores };
        scores[event.playerId] = (scores[event.playerId] ?? 0) + points;
        scores[round.explainerId] = (scores[round.explainerId] ?? 0) + explainerPoints(1);
        next = {
          ...next,
          scores,
          round: { ...next.round!, correct: [...round.correct, { playerId: event.playerId, elapsedMs, points }] },
        };
        if (allGuessed(next, ctx)) next = endRound(next, "all_guessed", ctx);
      }
      return ok(next, [{ type: "guessResult", playerId: event.playerId, result }]);
    }

    case "tick": {
      if (game.phase === "round" && game.round && ctx.now >= game.round.endsAt) {
        return ok(endRound(game, "timeout", ctx));
      }
      if (game.phase === "round" && game.round) {
        const explainer = ctx.players.find((p) => p.id === game.round!.explainerId);
        if (explainer && !explainer.connected && ctx.now - (explainer.disconnectedAt ?? ctx.now) >= EXPLAINER_GRACE_MS) {
          return ok(endRound(game, "explainer_left", ctx));
        }
      }
      if (game.phase === "round" && allGuessed(game, ctx)) return ok(endRound(game, "all_guessed", ctx));
      if (game.phase === "reveal" && game.revealEndsAt !== null && ctx.now >= game.revealEndsAt) {
        if (game.roundNumber >= ctx.settings.rounds) return ok({ ...game, phase: "finished", revealEndsAt: null });
        return ok(beginRound(game, ctx));
      }
      return ok(game);
    }

    case "playerLeft": {
      if (game.phase !== "round" && game.phase !== "reveal") return ok(game);
      if (ctx.players.length < 2) return ok({ ...game, phase: "finished", revealEndsAt: null });
      if (game.phase === "round" && game.round?.explainerId === event.playerId) {
        return ok(endRound(game, "explainer_left", ctx));
      }
      if (game.phase === "round" && allGuessed(game, ctx)) return ok(endRound(game, "all_guessed", ctx));
      return ok(game);
    }
  }
}
