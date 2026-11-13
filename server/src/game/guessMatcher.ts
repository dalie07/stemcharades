import { normalise, pluralEqual, type Card, type GuessResult } from "@stemcharades/shared";

export type { GuessResult };

/** Canonical form: no case, accents, punctuation or spacing. Plurals are handled by pluralEqual. */
function key(text: string): string {
  return normalise(text.replace(/['\u2019]/g, ""))
    .split(" ")
    .filter(Boolean)
    .join("");
}

/** The same, with a leading "the/a/an" dropped. "A.P.I." must still match "api", so both forms are tried. */
function keys(text: string): string[] {
  const clean = text.replace(/['\u2019]/g, ""); // "Newton's" -> "Newtons", before words are split
  const full = key(clean);
  const stripped = key(normalise(clean).replace(/^(the|a|an) /, ""));
  return stripped === full ? [full] : [full, stripped];
}

/** Optimal string alignment distance: a swap of two neighbouring letters counts as one typo. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Judge a guess against a card's accepted answers.
 * - correct: equal to an answer or alias after normalising case, spacing, punctuation, articles, plurals.
 * - close: one typo (two for long answers) away. Earns nothing and reveals nothing.
 * - wrong: anything else.
 * Returns only the label, never the answer.
 */
export function matchGuess(guess: string, card: Pick<Card, "answers">): GuessResult {
  const guesses = keys(guess).filter(Boolean);
  if (guesses.length === 0) return "wrong";
  const answers = card.answers.map(key).filter(Boolean);
  if (guesses.some((g) => answers.some((a) => pluralEqual(g, a)))) return "correct";
  for (const a of answers) {
    // Short answers and anything with digits must be exact: "dna" vs "rna", "180" vs "181" are different answers.
    if (a.length < 4 || /\d/.test(a)) continue;
    const tolerance = a.length >= 8 ? 2 : 1;
    if (guesses.some((g) => distance(g, a) <= tolerance)) return "close";
  }
  return "wrong";
}
