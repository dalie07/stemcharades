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
  /** How long the card was on screen before it was got or skipped. */
  ms?: number;
}

export interface PartyState {
  phase: "ready" | "playing" | "reveal" | "summary";
  settings: PartySettings;
  pool: Card[];
  usedIds: string[];
  turnIndex: number;
  scores: number[];
  currentCard: Card | null;
  /** When the current card appeared, to time how fast it was got. */
  shownAt: number | null;
  endsAt: number | null;
  /** Cards this device missed before: they come back first, so they get revised. */
  priority: string[];
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

/**
 * The next card. Half the time, while the pool still holds cards this device missed before and has not seen
 * this game, it is one of those: that is how misses get revised. Otherwise any unused card.
 */
function next(state: Pick<PartyState, "pool" | "usedIds" | "priority">, rng: Rng, lastId?: string) {
  const used = new Set(state.usedIds);
  const due = state.pool.filter((c) => state.priority.includes(c.id) && !used.has(c.id) && c.id !== lastId);
  if (due.length && rng() < 0.5) {
    const card = due[Math.min(Math.floor(rng() * due.length), due.length - 1)]!;
    return { card, usedIds: [...state.usedIds, card.id] };
  }
  return pickCard(state.pool, state.usedIds, rng, lastId);
}

/** Pure: the caller supplies the clock (`now`, in ms) and the random source. */
export function createParty(settings: PartySettings, allCards: Card[], priority: string[] = []): PartyState {
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
    shownAt: null,
    endsAt: null,
    priority,
    turnResults: [],
    history: [],
  };
}

export function startTurn(state: PartyState, now: number, rng: Rng = Math.random): PartyState {
  if (state.phase !== "ready") return state;
  const pick = next(state, rng);
  return {
    ...state,
    phase: "playing",
    currentCard: pick.card,
    shownAt: now,
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
    shownAt: null,
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
  const played: PlayedCard = { card: expired.currentCard, outcome, player, ms: now - (expired.shownAt ?? now) };
  const scores = [...expired.scores];
  if (outcome === "got") {
    const i = expired.turnIndex % expired.settings.players.length;
    scores[i] = (scores[i] ?? 0) + explainerPoints(1);
  }
  const pick = next(expired, rng, expired.currentCard.id);
  return {
    ...expired,
    scores,
    currentCard: pick.card,
    shownAt: now,
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

/** Got-its in a row at the end of the current turn: what the "On fire" banner counts. */
export function currentRun(state: PartyState): number {
  let n = 0;
  for (let i = state.turnResults.length - 1; i >= 0 && state.turnResults[i]!.outcome === "got"; i--) n++;
  return n;
}

export interface Highlights {
  fastest: { player: string; prompt: string; seconds: number } | null;
  longestRun: { player: string; count: number } | null;
  /** Cards this device had missed before and got this game. */
  learned: Card[];
}

/** The end-of-game moments worth showing, beyond the scores. */
export function highlights(state: PartyState): Highlights {
  let best: PlayedCard | null = null;
  for (const h of state.history) {
    if (h.outcome === "got" && h.ms !== undefined && (!best || h.ms < best.ms!)) best = h;
  }
  const fastest = best && { player: best.player, prompt: best.card.prompt, seconds: Math.max(1, Math.round(best.ms! / 1000)) };
  let longestRun: Highlights["longestRun"] = null;
  let run = 0;
  let prev: PlayedCard | undefined;
  for (const h of state.history) {
    run = h.outcome === "got" && prev?.outcome === "got" && prev.player === h.player ? run + 1 : h.outcome === "got" ? 1 : 0;
    if (run >= 2 && (!longestRun || run > longestRun.count)) longestRun = { player: h.player, count: run };
    prev = h;
  }
  const seen = new Set<string>();
  const learned = state.history
    .filter((h) => h.outcome === "got" && state.priority.includes(h.card.id))
    .map((h) => h.card)
    .filter((c) => !seen.has(c.id) && seen.add(c.id));
  return { fastest, longestRun, learned };
}
