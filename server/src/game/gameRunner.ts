import {
  explainerPoints,
  filterCards,
  type Card,
  type ErrorCode,
  type RoomView,
  type SummaryView,
} from "@stemcharades/shared";
import type { RoomManager, Room } from "./roomManager.js";
import { step, type Ctx, type Effect, type GameEvent } from "./roundEngine.js";


export type RunResult = { ok: true; effects: Effect[] } | { ok: false; error: ErrorCode };

/**
 * Connects the pure engine to live rooms: builds its inputs (clock, randomness, players, card pool),
 * stores the new state, and builds the role-specific view each player is allowed to see.
 */
export class GameRunner {
  private byId: Map<string, Card>;

  constructor(
    private rooms: RoomManager,
    private cards: readonly Card[],
    private clock: () => number = Date.now,
    private rng: () => number = Math.random,
    /** Called once when a game reaches "finished". Best-effort: a failure here must never affect play. */
    private onFinished?: (room: Room) => void,
  ) {
    this.byId = new Map(cards.map((c) => [c.id, c]));
  }

  /** A room's own custom cards take priority over the built-in deck. */
  private cardFor(room: Room, id: string): Card | undefined {
    return room.customDeck?.cards.find((c) => c.id === id) ?? this.byId.get(id);
  }

  private ctx(room: Room): Ctx {
    const custom = room.customDeck;
    return {
      now: this.clock(),
      rng: this.rng,
      // A custom deck ignores the curriculum choice, which only describes the built-in cards.
      settings: custom ? { ...room.settings, levels: [], courses: [], topics: [] } : room.settings,
      players: [...room.players]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({ id: p.id, connected: p.connected, disconnectedAt: p.connected ? undefined : p.lastSeenAt })),
      hostId: room.hostId,
      pool: custom ? custom.cards : filterCards(this.cards, room.settings),
      getCard: (id) => this.cardFor(room, id),
    };
  }

  apply(code: string, event: GameEvent): RunResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "unknown_room" };
    const res = step(room.game, event, this.ctx(room));
    if (!res.ok) return res;
    const before = room.game.phase;
    room.game = res.game;
    if (event.type !== "tick") room.lastActivityAt = this.clock();
    this.notifyIfFinished(room, before);
    return { ok: true, effects: res.effects };
  }

  /** Advance one room's timers. True if its state changed. */
  tick(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room || room.game.phase === "lobby" || room.game.phase === "finished") return false;
    const before = room.game;
    const res = step(before, { type: "tick" }, this.ctx(room));
    if (!res.ok || res.game === before) return false;
    room.game = res.game;
    this.notifyIfFinished(room, before.phase);
    return true;
  }

  private notifyIfFinished(room: Room, before: Room["game"]["phase"]): void {
    if (before === "finished" || room.game.phase !== "finished" || room.game.history.length === 0) return;
    try {
      this.onFinished?.(room);
    } catch (err) {
      console.error("finished-game hook failed", err);
    }
  }

  /** The server-run timer: call every few hundred ms. Returns the codes whose state changed. */
  tickAll(): string[] {
    const changed: string[] = [];
    for (const code of this.rooms.codes()) if (this.tick(code)) changed.push(code);
    return changed;
  }

  /**
   * What one player may see. The explainer gets the card prompt and forbidden words;
   * everyone else gets only its type and subject until the round is over.
   * The accepted answers and explanation are never in a view before the reveal.
   */
  viewFor(room: Room, playerId: string): RoomView {
    const view = this.rooms.view(room);
    const { game } = room;
    if (game.phase === "finished") view.summary = this.summary(room, view);
    const round = game.round;
    const card = round ? this.cardFor(room, round.cardId) : undefined;
    if (!round || !card || (game.phase !== "round" && game.phase !== "reveal")) return view;

    view.round = {
      number: round.number,
      totalRounds: room.settings.rounds,
      explainerId: round.explainerId,
      endsAt: round.endsAt,
      serverNow: this.clock(),
      clues: round.clues.map((c) => ({ id: c.id, text: c.text })),
      guessedCorrect: round.correct.map((c) => c.playerId),
      card: { type: card.type, subject: card.subject },
    };
    if (game.phase === "round" && playerId === round.explainerId) {
      view.round.explainerCard = {
        type: card.type,
        subject: card.subject,
        topic: card.topic,
        level: card.level,
        prompt: card.prompt,
        ...(card.latex ? { latex: card.latex } : {}),
        forbidden: [...card.forbidden],
      };
    }
    if (game.phase === "reveal" && round.outcome && game.revealEndsAt !== null) {
      const awards = round.correct.map((c) => ({ playerId: c.playerId, points: c.points }));
      const explainerTotal = explainerPoints(round.correct.length);
      if (explainerTotal > 0) awards.push({ playerId: round.explainerId, points: explainerTotal });
      view.reveal = {
        outcome: round.outcome,
        cardId: card.id,
        subject: card.subject,
        topic: card.topic,
        prompt: card.prompt,
        ...(card.latex ? { latex: card.latex } : {}),
        answers: [...card.answers],
        explanation: card.explanation,
        nextAt: game.revealEndsAt,
        awards,
      };
    }
    return view;
  }

  /** Final standings (ties share a rank) and the cards nobody guessed, for revision. */
  private summary(room: Room, view: RoomView): SummaryView {
    const ordered = [...view.players].sort((a, b) => b.score - a.score);
    const standings = ordered.map((p, i) => ({
      rank: i > 0 && ordered[i - 1]!.score === p.score ? 0 : i + 1,
      playerId: p.id,
      nickname: p.nickname,
      score: p.score,
    }));
    for (let i = 0; i < standings.length; i++) if (standings[i]!.rank === 0) standings[i]!.rank = standings[i - 1]!.rank;

    const seen = new Set<string>();
    const missed: SummaryView["missed"] = [];
    for (const record of room.game.history) {
      const card = this.cardFor(room, record.cardId);
      if (!card || record.correct.length > 0 || seen.has(card.id)) continue;
      seen.add(card.id);
      missed.push({
        id: card.id,
        type: card.type,
        subject: card.subject,
        topic: card.topic,
        prompt: card.prompt,
        ...(card.latex ? { latex: card.latex } : {}),
        answers: [...card.answers],
        explanation: card.explanation,
      });
    }
    return { standings, missed };
  }
}
