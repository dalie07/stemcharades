import { describe, expect, it } from "vitest";
import { explainerPoints, guesserPoints, speedBonus } from "./scoring.js";
import { pickCard } from "./cardPicker.js";
import type { Card } from "./schemas.js";

const mk = (n: number): Card => ({
  id: `phy-${String(n).padStart(4, "0")}`,
  type: "term",
  subject: "Physics",
  topic: "Mechanics",
  level: 1,
  prompt: `Card ${n}`,
  answers: [`answer ${n}`],
  forbidden: ["aaa", "bbb", "ccc"],
  explanation: "An explanation that is long enough.",
  status: "reviewed",
});

describe("scoring", () => {
  it("gives full speed bonus at 0s and none at the limit", () => {
    expect(speedBonus(0, 60000)).toBe(10);
    expect(speedBonus(60000, 60000)).toBe(0);
    expect(speedBonus(90000, 60000)).toBe(0);
  });
  it("scales linearly", () => expect(speedBonus(30000, 60000)).toBe(5));
  it("guesser gets 10 plus bonus", () => expect(guesserPoints(0, 60000)).toBe(20));
  it("explainer gets 5 per correct guesser", () => {
    expect(explainerPoints(3)).toBe(15);
    expect(explainerPoints(0)).toBe(0);
  });
});

describe("pickCard", () => {
  const pool = [mk(1), mk(2), mk(3)];
  it("never repeats before the pool is exhausted", () => {
    let used: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const p = pickCard(pool, used);
      seen.add(p.card.id);
      used = p.usedIds;
    }
    expect(seen.size).toBe(3);
  });
  it("reshuffles without an immediate repeat", () => {
    const all = pool.map((c) => c.id);
    for (let i = 0; i < 50; i++) {
      const p = pickCard(pool, all, Math.random, "phy-0002");
      expect(p.card.id).not.toBe("phy-0002");
      expect(p.usedIds).toHaveLength(1);
    }
  });
  it("copes with a one-card pool", () => {
    expect(pickCard([mk(1)], ["phy-0001"], Math.random, "phy-0001").card.id).toBe("phy-0001");
  });
  it("throws on an empty pool", () => expect(() => pickCard([], [])).toThrow());
});
