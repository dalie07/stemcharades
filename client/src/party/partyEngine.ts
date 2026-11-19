import { explainerPoints, filterCards, pickCard, type Card, type Selection } from "@stemcharades/shared";


export interface PartySettings extends Selection {
  players: string[];
  roundSeconds: 60 | 90;
  /** Full rotations: every player explains once per round. */
  rounds: number;
}

export type Outcome = "got" | "skipped" | "timeout";
export interface PlayedCard {
  card: Card;
  outcome: Outcome;
  player: string;
}

export interface PartyState {
  phase: "ready" | "playing" | "reveal" | "summary";
  settings: PartySettings;
  pool: Card[];
  usedIds: string[];
  turnIndex: number;
  scores: number[];
  currentCard: Card | null;
  endsAt: number | null;
  turnResults: PlayedCard[];
  history: PlayedCard[];
}

type Rng = () => number;

export function filterPool(cards: readonly Card[], s: Selection): Card[] {
  return filterCards(cards, s);
}

export function totalTurns(s: PartySettings): number {
  return s.players.length * s.rounds;
}

export function currentPlayer(state: PartyState): string {
  return state.settings.players[state.turnIndex % state.settings.players.length]!;
}

/** Pure: the caller supplies the clock (`now`, in ms) and the random source. */
export function createParty(settings: PartySettings, allCards: Card[]): PartyState {
  if (settings.players.length < 2) throw new Error("need at least 2 players");
  const pool = filterPool(allCards, settings);
  if (pool.length === 0) throw new Error("no cards match the filters");
  return {
    phase: "ready",
    settings,
    pool,
    usedIds: [],
    turnIndex: 0,
    scores: settings.players.map(() => 0),
    currentCard: null,
    endsAt: null,
    turnResults: [],
    history: [],
  };
}

export function startTurn(state: PartyState, now: number, rng: Rng = Math.random): PartyState {
  if (state.phase !== "ready") return state;
  const pick = pickCard(state.pool, state.usedIds, rng);
  return {
    ...state,
    phase: "playing",
    currentCard: pick.card,
    usedIds: pick.usedIds,
    endsAt: now + state.settings.roundSeconds * 1000,
    turnResults: [],
  };
}

function endTurn(state: PartyState): PartyState {
  const player = currentPlayer(state);
  const results = state.currentCard
    ? [...state.turnResults, { card: state.currentCard, outcome: "timeout" as const, player }]
    : state.turnResults;
  return {
    ...state,
    phase: "reveal",
    currentCard: null,
    endsAt: null,
    turnResults: results,
    history: [...state.history, ...(state.currentCard ? [results[results.length - 1]!] : [])],
  };
}

/** Ends the turn if time is up; otherwise returns the state unchanged. */
export function tick(state: PartyState, now: number): PartyState {
  if (state.phase === "playing" && state.endsAt !== null && now >= state.endsAt) return endTurn(state);
  return state;
}

function resolve(
  state: PartyState,
  now: number,
  outcome: "got" | "skipped",
  rng: Rng,
): PartyState {
  const expired = tick(state, now);
  if (expired.phase !== "playing" || !expired.currentCard) return expired;
  const player = currentPlayer(expired);
  const played: PlayedCard = { card: expired.currentCard, outcome, player };
  const scores = [...expired.scores];
  if (outcome === "got") {
    const i = expired.turnIndex % expired.settings.players.length;
    scores[i] = (scores[i] ?? 0) + explainerPoints(1);
  }
  const pick = pickCard(expired.pool, expired.usedIds, rng, expired.currentCard.id);
  return {
    ...expired,
    scores,
    currentCard: pick.card,
    usedIds: pick.usedIds,
    turnResults: [...expired.turnResults, played],
    history: [...expired.history, played],
  };
}

export const gotIt = (s: PartyState, now: number, rng: Rng = Math.random) => resolve(s, now, "got", rng);
export const skip = (s: PartyState, now: number, rng: Rng = Math.random) => resolve(s, now, "skipped", rng);

/** From the reveal screen: pass the phone on, or finish. */
export function nextTurn(state: PartyState): PartyState {
  if (state.phase !== "reveal") return state;
  const turnIndex = state.turnIndex + 1;
  if (turnIndex >= totalTurns(state.settings)) return { ...state, phase: "summary", turnIndex };
  return { ...state, phase: "ready", turnIndex, turnResults: [] };
}

/** Cards nobody got, once each, for the revision list. */
export function missedCards(state: PartyState): Card[] {
  const got = new Set(state.history.filter((h) => h.outcome === "got").map((h) => h.card.id));
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const h of state.history) {
    if (h.outcome !== "got" && !got.has(h.card.id) && !seen.has(h.card.id)) {
      seen.add(h.card.id);
      out.push(h.card);
    }
  }
  return out;
}
