/** Documented scoring rules (game flow step 8). Used by Party mode now and online rooms later. */
export const GUESSER_BASE_POINTS = 10;
export const MAX_SPEED_BONUS = 10;
export const EXPLAINER_POINTS_PER_GUESSER = 5;

/** Up to 10 bonus points, falling linearly from full marks at 0s to none at the round limit. */
export function speedBonus(elapsedMs: number, roundMs: number): number {
  if (roundMs <= 0) return 0;
  const remaining = Math.min(Math.max(1 - elapsedMs / roundMs, 0), 1);
  return Math.round(MAX_SPEED_BONUS * remaining);
}

export function guesserPoints(elapsedMs: number, roundMs: number): number {
  return GUESSER_BASE_POINTS + speedBonus(elapsedMs, roundMs);
}

export function explainerPoints(correctGuessers: number): number {
  return EXPLAINER_POINTS_PER_GUESSER * Math.max(0, correctGuessers);
}
