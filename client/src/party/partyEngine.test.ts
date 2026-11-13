import { describe, expect, it } from "vitest";
import type { Card } from "@stemcharades/shared";
import {
  createParty,
  currentPlayer,
  gotIt,
  missedCards,
  nextTurn,
  skip,
  startTurn,
  tick,
  type PartySettings,
} from "./partyEngine";

const mk = (n: number, subject: Card["subject"] = "Physics", level: 1 | 2 | 3 = 1): Card => ({
  id: `phy-${String(n).padStart(4, "0")}`,
  type: "term",
  subject,
  topic: "Mechanics",
  level,
  prompt: `Card ${n}`,
  answers: [`answer ${n}`],
  forbidden: ["aaa", "bbb", "ccc"],
  explanation: "An explanation that is long enough.",
  status: "reviewed",
});

const cards = [1, 2, 3, 4, 5, 6].map((n) => mk(n));
const settings: PartySettings = {
  players: ["Ann", "Ben"],
  subjects: ["Physics"],
  levels: [1],
  roundSeconds: 60,
  rounds: 1,
};
const rng = () => 0;

describe("party engine", () => {
  it("rejects fewer than two players or an empty pool", () => {
    expect(() => createParty({ ...settings, players: ["Ann"] }, cards)).toThrow();
    expect(() => createParty({ ...settings, subjects: ["Maths"] }, cards)).toThrow();
  });

  it("filters the pool by subject and level", () => {
    const mixed = [...cards, mk(7, "Maths"), mk(8, "Physics", 2)];
    expect(createParty(settings, mixed).pool).toHaveLength(6);
  });

  it("scores explainer 5 per Got it and 0 for Skip", () => {
    let s = startTurn(createParty(settings, cards), 0, rng);
    s = gotIt(s, 1000, rng);
    s = gotIt(s, 2000, rng);
    s = skip(s, 3000, rng);
    expect(s.scores).toEqual([10, 0]);
    expect(s.turnResults.map((r) => r.outcome)).toEqual(["got", "got", "skipped"]);
  });

  it("ends the turn at the deadline and counts the shown card as a timeout", () => {
    let s = startTurn(createParty(settings, cards), 0, rng);
    s = tick(s, 59_999);
    expect(s.phase).toBe("playing");
    s = tick(s, 60_000);
    expect(s.phase).toBe("reveal");
    expect(s.turnResults.at(-1)?.outcome).toBe("timeout");
  });

  it("ignores a Got it that arrives after time is up", () => {
    let s = startTurn(createParty(settings, cards), 0, rng);
    s = gotIt(s, 61_000, rng);
    expect(s.phase).toBe("reveal");
    expect(s.scores).toEqual([0, 0]);
  });

  it("rotates players and finishes with a summary", () => {
    let s = createParty(settings, cards);
    expect(currentPlayer(s)).toBe("Ann");
    s = nextTurn(tick(startTurn(s, 0, rng), 60_000));
    expect(s.phase).toBe("ready");
    expect(currentPlayer(s)).toBe("Ben");
    s = nextTurn(tick(startTurn(s, 0, rng), 60_000));
    expect(s.phase).toBe("summary");
  });

  it("never shows the same card twice in a row", () => {
    let s = startTurn(createParty(settings, cards), 0, Math.random);
    for (let i = 0; i < 40; i++) {
      const before = s.currentCard!.id;
      s = skip(s, i, Math.random);
      expect(s.currentCard!.id).not.toBe(before);
    }
  });

  it("lists missed cards once, excluding any that were later got", () => {
    let s = startTurn(createParty(settings, cards), 0, rng);
    s = skip(s, 1, rng); // card 1 skipped
    s = skip(s, 2, rng); // card 2 skipped
    s = tick(s, 60_000); // card 3 times out
    expect(missedCards(s).map((c) => c.id)).toEqual(["phy-0001", "phy-0002", "phy-0003"]);
  });
});
