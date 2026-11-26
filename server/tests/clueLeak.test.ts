import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deckSchema, type Card } from "@stemcharades/shared";
import { checkClue } from "../src/game/clueFilter.js";
import { matchGuess } from "../src/game/guessMatcher.js";

const decksDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../content/decks");
const cards: Card[] = readdirSync(decksDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => deckSchema.parse(JSON.parse(readFileSync(path.join(decksDir, f), "utf8"))));

/** Ways a player might try to sneak a word past the filter. */
function attempts(word: string): string[] {
  const w = word.toLowerCase();
  const out = [w, w.toUpperCase(), `It is ${w}!`, `${w}.`, `... ${w} ...`, `(${w})`, `so ${w.toUpperCase()} again`];
  if (/^[a-z]{3,}$/.test(w) && !w.endsWith("s")) out.push(`${w}s`); // plural
  if (/^[a-z]+$/.test(w) && w.length >= 6) out.push(`${w.slice(0, 3)} ${w.slice(3)}`, `${w.slice(0, 3)}-${w.slice(3)}`); // split
  return out;
}

describe("clue-filter leak rate on every card in every deck", () => {
  it("lets zero forbidden words or answers through", () => {
    let tried = 0;
    const leaks: string[] = [];
    for (const card of cards) {
      // Short aliases (<=2 letters, like "he" or "ml") are deliberately not enforced as clue words.
      const must = [
        ...card.forbidden,
        ...card.answers.filter((a) => a.replace(/[^a-z0-9]/gi, "").length >= 3 || /^\d+$/.test(a)),
        ...(card.type === "question" ? [] : [card.prompt]),
      ];
      for (const word of must) {
        for (const attempt of attempts(word)) {
          tried++;
          if (checkClue(attempt, card).ok) leaks.push(`${card.id} "${attempt}" (from "${word}")`);
        }
      }
    }
    console.log(`clue-filter leak rate: ${leaks.length} leaks in ${tried} attempts over ${cards.length} cards`);
    for (const l of leaks.slice(0, 20)) console.log("  leak:", l);
    expect(leaks).toEqual([]);
  });
});

describe("every card in every deck can actually be played", () => {
  it("accepts each of its answers in any case, refuses a giveaway clue, allows an ordinary one, and rejects nonsense", () => {
    const problems: string[] = [];
    for (const card of cards) {
      for (const a of card.answers) {
        if (matchGuess(a.toUpperCase(), card) !== "correct") problems.push(`${card.id}: answer "${a}" is not accepted`);
      }
      if (matchGuess("zzzz banana", card) !== "wrong") problems.push(`${card.id}: a nonsense guess is not wrong`);
      if (!checkClue("a perfectly harmless opening hint", card).ok) problems.push(`${card.id}: an ordinary clue is refused`);
      // Someone can always be stopped from typing the card away: by its answer, or else a forbidden word.
      if (checkClue(`it is ${card.forbidden[0]}`, card).ok) problems.push(`${card.id}: a forbidden word gets through`);
    }
    expect(problems).toEqual([]);
  });
});
