import { normalise } from "./normalise.js";
import type { Card } from "./schemas.js";

/** Problems with a set of cards beyond what the schema can express. Empty array = valid. */
export function checkDeck(cards: Card[]): string[] {
  const problems: string[] = [];
  const ids = new Map<string, number>();
  const answerOwner = new Map<string, string>();

  for (const card of cards) {
    ids.set(card.id, (ids.get(card.id) ?? 0) + 1);

    const answers = card.answers.map(normalise);
    for (const a of answers) {
      const owner = answerOwner.get(a);
      if (owner && owner !== card.id) {
        problems.push(`${card.id}: answer "${a}" is also an answer of ${owner}`);
      } else {
        answerOwner.set(a, card.id);
      }
    }

    for (const word of card.forbidden) {
      const w = normalise(word);
      if (answers.includes(w)) {
        problems.push(`${card.id}: forbidden word "${word}" is itself an accepted answer`);
      }
    }
  }

  for (const [id, n] of ids) if (n > 1) problems.push(`${id}: duplicate id (${n} cards)`);
  return problems;
}
