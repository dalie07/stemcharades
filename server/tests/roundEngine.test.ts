import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Card, type RoomSettings } from "@stemcharades/shared";
import {
  MAX_CLUES_PER_ROUND,
  MAX_GUESSES_PER_ROUND,
  REVEAL_MS,
  newGame,
  step,
  type Ctx,
  type Game,
} from "../src/game/roundEngine.js";

const mk = (n: number): Card => ({
  id: `phy-${String(n).padStart(4, "0")}`,
  type: "term",
  subject: "Physics",
  topic: "Mechanics",
  level: 1,
  // Letters only: answers containing digits must be matched exactly, so they can never be "close".
  prompt: `Wordnumber${"abcdef"[n - 1]}`,
  answers: [`wordnumber${"abcdef"[n - 1]}`],
  forbidden: ["alpha", "beta", "gamma"],
  explanation: `Explanation number ${n} that is long enough.`,
  status: "reviewed",
});
const cards = [1, 2, 3, 4, 5, 6].map(mk);
const byId = new Map(cards.map((c) => [c.id, c]));

const players = (n: number, connected = true) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, connected }));

function ctx(over: Partial<Ctx> = {}): Ctx {
  const settings: RoomSettings = { ...DEFAULT_SETTINGS, rounds: 3, roundSeconds: 60 };
  return {
    now: 0,
    rng: () => 0,
    settings,
    players: players(3),
    hostId: "p1",
    pool: cards,
    getCard: (id) => byId.get(id),
    ...over,
  };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const ok = (g: Game, e: Parameters<typeof step>[1], c: Ctx) => {
  const r = step(g, e, c);
  if (!r.ok) throw new Error(`unexpected error ${r.error}`);
  return r;
};

function started(c = ctx()) {
  return ok(newGame(), { type: "start", playerId: "p1" }, c).game;
}

describe("starting a game", () => {
  it("only the host can start", () => {
    expect(step(newGame(), { type: "start", playerId: "p2" }, ctx())).toEqual({ ok: false, error: "not_host" });
  });
  it("needs two connected players", () => {
    expect(step(newGame(), { type: "start", playerId: "p1" }, ctx({ players: players(1) }))).toEqual({ ok: false, error: "not_enough_players" });
    const mixed = [{ id: "p1", connected: true }, { id: "p2", connected: false }];
    expect(step(newGame(), { type: "start", playerId: "p1" }, ctx({ players: mixed }))).toEqual({ ok: false, error: "not_enough_players" });
  });
  it("needs cards", () => {
    expect(step(newGame(), { type: "start", playerId: "p1" }, ctx({ pool: [] }))).toEqual({ ok: false, error: "no_cards" });
  });
  it("cannot start while a round is running", () => {
    expect(step(started(), { type: "start", playerId: "p1" }, ctx())).toEqual({ ok: false, error: "out_of_turn" });
  });
  it("begins round 1 with the first player explaining and the timer set", () => {
    const g = started(ctx({ now: 5000 }));
    expect(g.phase).toBe("round");
    expect(g.roundNumber).toBe(1);
    expect(g.round).toMatchObject({ number: 1, explainerId: "p1", startedAt: 5000, endsAt: 65_000, clues: [], outcome: null });
    expect(g.usedCardIds).toEqual([g.round!.cardId]);
  });
  it("uses the room's round length (90s)", () => {
    const g = started(ctx({ settings: { ...DEFAULT_SETTINGS, roundSeconds: 90 } }));
    expect(g.round!.endsAt).toBe(90_000);
  });
});

describe("clues", () => {
  it("accepts a clean clue from the explainer and numbers it", () => {
    let g = started();
    g = ok(g, { type: "clue", playerId: "p1", text: " something clean " }, ctx()).game;
    g = ok(g, { type: "clue", playerId: "p1", text: "another" }, ctx()).game;
    expect(g.round!.clues).toEqual([{ id: 1, text: "something clean" }, { id: 2, text: "another" }]);
  });
  it("rejects clues from anyone else as out of turn", () => {
    expect(step(started(), { type: "clue", playerId: "p2", text: "hi" }, ctx())).toEqual({ ok: false, error: "out_of_turn" });
  });
  it("rejects an empty clue", () => {
    expect(step(started(), { type: "clue", playerId: "p1", text: "   " }, ctx())).toEqual({ ok: false, error: "invalid_payload" });
  });
  it("tells only the explainer why a clue was rejected and never stores it", () => {
    const g = started();
    const card = byId.get(g.round!.cardId)!;
    const r = ok(g, { type: "clue", playerId: "p1", text: `it is ${card.prompt.toUpperCase()}` }, ctx());
    expect(r.game).toBe(g);
    expect(r.effects).toEqual([{ type: "clueRejected", playerId: "p1", rejection: { reason: "contains_answer", word: card.prompt } }]);
    const r2 = ok(g, { type: "clue", playerId: "p1", text: "so Alpha-ish" }, ctx());
    expect(r2.effects[0]).toMatchObject({ rejection: { reason: "forbidden_word", word: "alpha" } });
    expect(r2.game.round!.clues).toHaveLength(0);
  });
  it("caps clues per round", () => {
    let g = started();
    for (let i = 0; i < MAX_CLUES_PER_ROUND; i++) g = ok(g, { type: "clue", playerId: "p1", text: `clue ${i}` }, ctx()).game;
    expect(step(g, { type: "clue", playerId: "p1", text: "one more" }, ctx())).toEqual({ ok: false, error: "rate_limited" });
  });
  it("is refused once time is up, before the tick has run", () => {
    expect(step(started(), { type: "clue", playerId: "p1", text: "late" }, ctx({ now: 60_000 }))).toEqual({ ok: false, error: "out_of_turn" });
  });
});

const answerOf = (g: Game) => byId.get(g.round!.cardId)!.answers[0]!;
const guess = (g: Game, playerId: string, text: string, c: Ctx) => step(g, { type: "guess", playerId, text }, c);

describe("guessing and scoring", () => {
  it("scores a correct guess 10 plus up to 10 for speed, and the explainer 5 per guesser", () => {
    const g0 = started();
    const r = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0).toUpperCase() }, ctx({ now: 0 }));
    expect(r.game.scores).toEqual({ p2: 20, p1: 5 });
    expect(r.effects).toEqual([{ type: "guessResult", playerId: "p2", result: "correct" }]);
    const slow = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx({ now: 30_000 }));
    expect(slow.game.scores.p2).toBe(15);
    const last = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx({ now: 59_999 }));
    expect(last.game.scores.p2).toBe(10);
  });
  it("gives wrong and close guesses no points and does not end or change the round", () => {
    const g0 = started();
    const wrong = ok(g0, { type: "guess", playerId: "p2", text: "banana" }, ctx());
    expect(wrong.effects).toEqual([{ type: "guessResult", playerId: "p2", result: "wrong" }]);
    expect(wrong.game.scores).toEqual({});
    expect(wrong.game.phase).toBe("round");
    const close = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0).slice(0, -1) + "q" }, ctx());
    expect(close.effects[0]).toMatchObject({ result: "close" });
    expect(close.game.scores).toEqual({});
  });
  it("never lets the explainer guess their own card", () => {
    const g0 = started();
    expect(guess(g0, "p1", answerOf(g0), ctx())).toEqual({ ok: false, error: "out_of_turn" });
  });
  it("scores each player at most once per round", () => {
    const g0 = started();
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx()).game;
    expect(guess(g1, "p2", answerOf(g0), ctx())).toEqual({ ok: false, error: "out_of_turn" });
    expect(g1.round!.correct).toHaveLength(1);
  });
  it("scores two players who guess at the same instant exactly once each", () => {
    const g0 = started(ctx({ players: players(4) }));
    const c = ctx({ now: 10_000, players: players(4) });
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, c).game;
    const g2 = ok(g1, { type: "guess", playerId: "p3", text: answerOf(g0) }, c).game;
    expect(g2.scores).toEqual({ p2: 18, p3: 18, p1: 10 });
    expect(g2.round!.correct.map((x) => x.playerId)).toEqual(["p2", "p3"]);
  });
  it("ends the round when every connected guesser has it, and records who", () => {
    const g0 = started();
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx({ now: 1000 })).game;
    expect(g1.phase).toBe("round");
    const g2 = ok(g1, { type: "guess", playerId: "p3", text: answerOf(g0) }, ctx({ now: 2000 })).game;
    expect(g2.phase).toBe("reveal");
    expect(g2.round!.outcome).toBe("all_guessed");
    expect(g2.revealEndsAt).toBe(2000 + REVEAL_MS);
    expect(g2.history).toEqual([{ number: 1, cardId: g0.round!.cardId, explainerId: "p1", outcome: "all_guessed", correct: ["p2", "p3"], fastestMs: 1000 }]);
  });
  it("does not wait for a disconnected guesser", () => {
    const g0 = started();
    const away = ctx({ players: [{ id: "p1", connected: true }, { id: "p2", connected: true }, { id: "p3", connected: false }] });
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, away).game;
    expect(g1.phase).toBe("reveal");
  });
  it("a tick ends the round if the last waiting guesser dropped after the others got it", () => {
    const g0 = started();
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx()).game;
    expect(g1.phase).toBe("round");
    const away = ctx({ players: [{ id: "p1", connected: true }, { id: "p2", connected: true }, { id: "p3", connected: false }] });
    expect(ok(g1, { type: "tick" }, away).game.round!.outcome).toBe("all_guessed");
  });
  it("a guesser leaving ends the round if everyone left behind already has it", () => {
    const g0 = started();
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx()).game;
    const after = ok(g1, { type: "playerLeft", playerId: "p3" }, ctx({ players: players(3).slice(0, 2) })).game;
    expect(after.round!.outcome).toBe("all_guessed");
  });
  it("awards nobody anything when the timer expires with no correct guess", () => {
    const g0 = ok(started(), { type: "guess", playerId: "p2", text: "nope" }, ctx()).game;
    const g1 = ok(g0, { type: "tick" }, ctx({ now: 60_000 })).game;
    expect(g1.round!.outcome).toBe("timeout");
    expect(g1.scores).toEqual({});
    expect(g1.history[0]!.correct).toEqual([]);
  });
  it("keeps points already earned if the explainer then skips", () => {
    const g0 = started();
    const g1 = ok(g0, { type: "guess", playerId: "p2", text: answerOf(g0) }, ctx()).game;
    const g2 = ok(g1, { type: "skip", playerId: "p1" }, ctx()).game;
    expect(g2.scores).toEqual({ p2: 20, p1: 5 });
    expect(g2.round!.outcome).toBe("skipped");
  });
  it("refuses guesses after the deadline, empty guesses and floods", () => {
    const g0 = started();
    expect(guess(g0, "p2", answerOf(g0), ctx({ now: 60_000 }))).toEqual({ ok: false, error: "out_of_turn" });
    expect(guess(g0, "p2", "  ", ctx())).toEqual({ ok: false, error: "invalid_payload" });
    let g = g0;
    for (let i = 0; i < MAX_GUESSES_PER_ROUND; i++) g = ok(g, { type: "guess", playerId: "p2", text: `wrong ${i}` }, ctx()).game;
    expect(guess(g, "p2", "one more", ctx())).toEqual({ ok: false, error: "rate_limited" });
    expect(guess(g, "p3", "someone else is fine", ctx()).ok).toBe(true);
  });
  it("refuses guesses outside a round", () => {
    expect(guess(newGame(), "p2", "x", ctx())).toEqual({ ok: false, error: "out_of_turn" });
  });
  it("starting a new game resets the scores and history", () => {
    let g = started();
    g = ok(g, { type: "guess", playerId: "p2", text: answerOf(g) }, ctx()).game;
    g = ok(g, { type: "playerLeft", playerId: "p3" }, ctx({ players: players(1) })).game; // game finishes
    expect(g.phase).toBe("finished");
    const again = ok(g, { type: "start", playerId: "p1" }, ctx()).game;
    expect(again.scores).toEqual({});
    expect(again.history).toEqual([]);
  });
});

describe("skipping and the timer", () => {
  it("lets the explainer skip, ending the round with the reveal", () => {
    const g = ok(started(), { type: "skip", playerId: "p1" }, ctx({ now: 1000 })).game;
    expect(g.phase).toBe("reveal");
    expect(g.round!.outcome).toBe("skipped");
    expect(g.revealEndsAt).toBe(1000 + REVEAL_MS);
  });
  it("does not let guessers skip", () => {
    expect(step(started(), { type: "skip", playerId: "p2" }, ctx())).toEqual({ ok: false, error: "out_of_turn" });
  });
  it("a tick before the deadline changes nothing", () => {
    const g = started();
    const r = ok(g, { type: "tick" }, ctx({ now: 59_999 }));
    expect(r.game).toBe(g);
  });
  it("the timer expiring ends the round with nobody scoring", () => {
    const g = ok(started(), { type: "tick" }, ctx({ now: 60_000 })).game;
    expect(g.phase).toBe("reveal");
    expect(g.round!.outcome).toBe("timeout");
  });
  it("advances to the next round after the reveal pause, with the next explainer", () => {
    let g = ok(started(), { type: "tick" }, ctx({ now: 60_000 })).game;
    expect(ok(g, { type: "tick" }, ctx({ now: 60_000 + REVEAL_MS - 1 })).game).toBe(g);
    g = ok(g, { type: "tick" }, ctx({ now: 60_000 + REVEAL_MS })).game;
    expect(g.phase).toBe("round");
    expect(g.roundNumber).toBe(2);
    expect(g.round!.explainerId).toBe("p2");
    expect(g.round!.endsAt).toBe(60_000 + REVEAL_MS + 60_000);
  });
  it("finishes after the last round", () => {
    let g = started(ctx({ settings: { ...DEFAULT_SETTINGS, rounds: 1 } }));
    g = ok(g, { type: "tick" }, ctx({ now: 60_000, settings: { ...DEFAULT_SETTINGS, rounds: 1 } })).game;
    g = ok(g, { type: "tick" }, ctx({ now: 70_000, settings: { ...DEFAULT_SETTINGS, rounds: 1 } })).game;
    expect(g.phase).toBe("finished");
    expect(ok(g, { type: "start", playerId: "p1" }, ctx()).game.phase).toBe("round"); // play again
  });
});

describe("rotation and the card picker", () => {
  function playRounds(n: number, c: Partial<Ctx> = {}) {
    let now = 0;
    const settings = { ...DEFAULT_SETTINGS, rounds: n, roundSeconds: 60 as const };
    let g = ok(newGame(), { type: "start", playerId: "p1" }, ctx({ now, settings, ...c })).game;
    const seen: { explainer: string; card: string }[] = [{ explainer: g.round!.explainerId, card: g.round!.cardId }];
    for (let i = 1; i < n; i++) {
      now += 60_000;
      g = ok(g, { type: "tick" }, ctx({ now, settings, ...c })).game;
      now += REVEAL_MS;
      g = ok(g, { type: "tick" }, ctx({ now, settings, ...c })).game;
      seen.push({ explainer: g.round!.explainerId, card: g.round!.cardId });
    }
    return seen;
  }
  it("rotates the explainer through every player in order and wraps", () => {
    expect(playRounds(7).map((s) => s.explainer)).toEqual(["p1", "p2", "p3", "p1", "p2", "p3", "p1"]);
  });
  it("skips a disconnected player", () => {
    const ps = [{ id: "p1", connected: true }, { id: "p2", connected: false }, { id: "p3", connected: true }];
    expect(playRounds(4, { players: ps }).map((s) => s.explainer)).toEqual(["p1", "p3", "p1", "p3"]);
  });
  it("skips nobody when an earlier player leaves mid-cycle", () => {
    const settings = { ...DEFAULT_SETTINGS, rounds: 10, roundSeconds: 60 as const };
    const four = players(4);
    let g = ok(newGame(), { type: "start", playerId: "p1" }, ctx({ settings, players: four })).game;
    expect(g.round!.explainerId).toBe("p1");
    // p1 leaves during their own round; p2 must still be next, not p3.
    const three = four.slice(1);
    g = ok(g, { type: "playerLeft", playerId: "p1" }, ctx({ now: 1000, settings, players: three })).game;
    g = ok(g, { type: "tick" }, ctx({ now: 1000 + REVEAL_MS, settings, players: three })).game;
    expect(g.round!.explainerId).toBe("p2");
  });
  it("gives a late joiner a turn at the end of the current cycle", () => {
    const settings = { ...DEFAULT_SETTINGS, rounds: 10, roundSeconds: 60 as const };
    let now = 0;
    let ps = players(2);
    let g = ok(newGame(), { type: "start", playerId: "p1" }, ctx({ settings, players: ps })).game;
    const order = [g.round!.explainerId];
    for (let i = 0; i < 4; i++) {
      if (i === 0) ps = players(3); // p3 joins during the first round
      now += 60_000;
      g = ok(g, { type: "tick" }, ctx({ now, settings, players: ps })).game;
      now += REVEAL_MS;
      g = ok(g, { type: "tick" }, ctx({ now, settings, players: ps })).game;
      order.push(g.round!.explainerId);
    }
    expect(order).toEqual(["p1", "p2", "p3", "p1", "p2"]);
  });
  it("never repeats a card until the pool is exhausted", () => {
    const first = playRounds(6, { rng: Math.random }).map((s) => s.card);
    expect(new Set(first).size).toBe(6);
  });
  it("reshuffles with no immediate repeat once exhausted", () => {
    const small = cards.slice(0, 2);
    for (let t = 0; t < 20; t++) {
      const ids = playRounds(10, { pool: small, rng: Math.random }).map((s) => s.card);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });
});

describe("disconnect rules and blocked clues", () => {
  const away = (since: number) => [
    { id: "p1", connected: false, disconnectedAt: since },
    { id: "p2", connected: true },
    { id: "p3", connected: true },
  ];
  it("keeps the round while the explainer is away for under 20 seconds", () => {
    const g = started();
    expect(ok(g, { type: "tick" }, ctx({ now: 19_999, players: away(0) })).game).toBe(g);
  });
  it("skips the round once the explainer has been away for 20 seconds", () => {
    const g = ok(started(), { type: "tick" }, ctx({ now: 20_000, players: away(0) })).game;
    expect(g.phase).toBe("reveal");
    expect(g.round!.outcome).toBe("explainer_left");
  });
  it("rejects an inappropriate clue to the explainer without storing or echoing it", () => {
    const g = started();
    const r = ok(g, { type: "clue", playerId: "p1", text: "this is shit" }, ctx());
    expect(r.game).toBe(g);
    expect(r.effects).toEqual([{ type: "clueRejected", playerId: "p1", rejection: { reason: "inappropriate", word: "" } }]);
  });
});

describe("players leaving", () => {
  it("ends the round if the explainer leaves", () => {
    const g = ok(started(), { type: "playerLeft", playerId: "p1" }, ctx({ now: 2000, players: players(3).slice(1) })).game;
    expect(g.phase).toBe("reveal");
    expect(g.round!.outcome).toBe("explainer_left");
  });
  it("ignores a guesser leaving while two or more remain", () => {
    const g = started();
    const r = ok(g, { type: "playerLeft", playerId: "p3" }, ctx({ players: players(2) }));
    expect(r.game).toBe(g);
  });
  it("finishes the game when fewer than two players remain", () => {
    const g = ok(started(), { type: "playerLeft", playerId: "p2" }, ctx({ players: players(1) })).game;
    expect(g.phase).toBe("finished");
  });
});

describe("purity", () => {
  it("never mutates its input and is deterministic", () => {
    const g = deepFreeze(started());
    const c = deepFreeze(ctx({ now: 1234 }));
    const events: Parameters<typeof step>[1][] = [
      { type: "clue", playerId: "p1", text: "fine clue" },
      { type: "clue", playerId: "p1", text: "alpha" },
      { type: "skip", playerId: "p1" },
      { type: "tick" },
      { type: "playerLeft", playerId: "p1" },
    ];
    for (const e of events) expect(step(g, e, c)).toEqual(step(g, e, c));
  });
});
