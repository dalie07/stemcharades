import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Card } from "@stemcharades/shared";
import type { Room, Player } from "../src/game/roomManager.js";
import { newGame, type Game } from "../src/game/roundEngine.js";
import { snapshotFinished } from "../src/persist.js";

const player = (id: string, userId?: string): Player => ({ id, nickname: id, ...(userId ? { userId } : {}), sessionTokenHash: "h", connected: true, joinedAt: 0, lastSeenAt: 0, socketId: null });

function room(players: Player[], game: Partial<Game>, customDeck?: Room["customDeck"]): Room {
  return { code: "ABCDE", hostId: players[0]!.id, settings: DEFAULT_SETTINGS, game: { ...newGame(), phase: "finished", ...game }, players, kicked: new Set(), claimed: true, createdAt: 0, lastActivityAt: 0, ...(customDeck ? { customDeck } : {}) };
}
const rec = (n: number, cardId: string, explainerId: string, correct: string[], fastestMs: number | null) => ({ number: n, cardId, explainerId, outcome: "timeout" as const, correct, fastestMs });

describe("snapshotFinished", () => {
  it("returns nothing for a game with no completed rounds", () => {
    expect(snapshotFinished(room([player("a")], { history: [] }))).toBeNull();
  });

  it("stores only signed-in players and ranks them against everyone, guests included", () => {
    const r = room([player("g1"), player("u1", "user-1"), player("u2", "user-2")], {
      history: [rec(1, "phy-0001", "g1", ["u1"], 4000)],
      scores: { g1: 50, u1: 30, u2: 30 }, // the guest leads; two signed-in players tie for second
    });
    const s = snapshotFinished(r)!;
    expect(s.roomSize).toBe(3);
    expect(s.players).toEqual([{ userId: "user-1", score: 30, rank: 2 }, { userId: "user-2", score: 30, rank: 2 }]);
    expect(JSON.stringify(s)).not.toContain("g1");
  });

  it("lists cards a signed-in player missed or got, never counting rounds they explained", () => {
    const r = room([player("u1", "user-1"), player("u2", "user-2")], {
      history: [
        rec(1, "bio-0001", "u1", ["u2"], 3000), // u1 explained, u2 got it
        rec(2, "bio-0002", "u2", [], null), // u2 explained, u1 missed it
        rec(3, "bio-0003", "u1", [], null), // u1 explained, u2 missed it
      ],
      scores: { u1: 5, u2: 10 },
    });
    const s = snapshotFinished(r)!;
    expect(s.missed).toEqual([{ userId: "user-1", cardIds: ["bio-0002"] }, { userId: "user-2", cardIds: ["bio-0003"] }]);
    expect(s.got).toEqual([{ userId: "user-1", cardIds: [] }, { userId: "user-2", cardIds: ["bio-0001"] }]);
  });

  it("records per-card statistics, converting milliseconds to seconds", () => {
    const r = room([player("a", "u"), player("b")], { history: [rec(1, "chem-0001".replace("chem", "che"), "b", ["a"], 12_500), rec(2, "che-0002", "b", [], null)], scores: {} });
    expect(snapshotFinished(r)!.cards).toEqual([
      { cardId: "che-0001", guessed: true, secondsToGuess: 12.5 },
      { cardId: "che-0002", guessed: false, secondsToGuess: null },
    ]);
  });

  it("keeps private custom cards out of the global statistics and revision list", () => {
    const deck = { id: "d", name: "Mine", cards: [] as Card[] };
    const r = room([player("a", "user-1"), player("b")], { history: [rec(1, "cus-123", "b", [], null), rec(2, "phy-0001", "b", [], null)], scores: {} }, deck);
    const s = snapshotFinished(r)!;
    expect(s.cards.map((c) => c.cardId)).toEqual(["phy-0001"]);
    expect(s.missed[0]!.cardIds).toEqual(["phy-0001"]);
    expect(s.settings).toMatchObject({ customDeck: true });
  });
});
