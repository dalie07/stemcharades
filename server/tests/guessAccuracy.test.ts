import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deckSchema, type Card } from "@stemcharades/shared";
import { matchGuess } from "../src/game/guessMatcher.js";

const here = path.dirname(new URL(import.meta.url).pathname);
const decksDir = path.resolve(here, "../../content/decks");
const cards = new Map<string, Card>();
for (const f of readdirSync(decksDir).filter((x) => x.endsWith(".json"))) {
  for (const c of deckSchema.parse(JSON.parse(readFileSync(path.join(decksDir, f), "utf8")))) cards.set(c.id, c);
}
const labelled = JSON.parse(readFileSync(path.join(here, "fixtures/guess-labels.json"), "utf8")) as {
  card: string;
  guess: string;
  label: "correct" | "close" | "wrong";
}[];

describe("guess matcher accuracy on the hand-labelled set", () => {
  it("has 200 labelled guesses over known cards", () => {
    expect(labelled).toHaveLength(200);
    for (const row of labelled) expect(cards.has(row.card), row.card).toBe(true);
  });

  it("agrees with the human labels at least 95% of the time", () => {
    const misses = labelled.filter((r) => matchGuess(r.guess, cards.get(r.card)!) !== r.label);
    const accuracy = (labelled.length - misses.length) / labelled.length;
    // Printed so the measured number can go in docs/test-plan.md.
    console.log(`guess-match accuracy: ${(accuracy * 100).toFixed(1)}% (${labelled.length - misses.length}/${labelled.length})`);
    for (const m of misses) console.log(`  miss: ${m.card} "${m.guess}" labelled ${m.label}, got ${matchGuess(m.guess, cards.get(m.card)!)}`);
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("never marks a wrong-labelled guess correct (no free points)", () => {
    const freebies = labelled.filter((r) => r.label === "wrong" && matchGuess(r.guess, cards.get(r.card)!) === "correct");
    expect(freebies).toEqual([]);
  });
});
