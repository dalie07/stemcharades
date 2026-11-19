import type { Card } from "@stemcharades/shared";
import { isBlocked } from "../game/blocklist.js";
import { checkClue } from "../game/clueFilter.js";

const LINK = /https?:\/\/|www\./i;

/**
 * Checks on what a card says, on top of the schema and the deck rules: nothing rude anywhere on it, no links,
 * and no question that contains its own answer. Run on every deck by the validator and at server start, so a
 * drafted card that slips through review still cannot reach players.
 */
export function contentProblems(cards: readonly Card[]): string[] {
  const problems: string[] = [];
  for (const card of cards) {
    const text = [card.prompt, card.latex ?? "", card.explanation, ...card.answers, ...card.forbidden].join(" ");
    if (isBlocked(text)) problems.push(`${card.id}: contains blocked language`);
    if (LINK.test(text)) problems.push(`${card.id}: contains a link`);
    // Forbidden words in a question are fine (only the explainer reads it); the answer itself is not.
    const leak = card.type === "question" ? checkClue(card.prompt, card) : { ok: true as const };
    if (!leak.ok && leak.reason === "contains_answer") problems.push(`${card.id}: the question gives away its answer`);
  }
  return problems;
}
