import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@stemcharades/shared";

/** What the player typed, made into a code: capitals, and no spaces or dashes the keyboard slipped in. */
export const cleanCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "").slice(0, ROOM_CODE_LENGTH);

/** Why a code cannot be right, in words a player can act on, or null if it looks fine. */
export function codeProblem(code: string): string | null {
  if (!code) return "Enter the 5-character room code shown on the host's screen.";
  if (/[O0I1]/.test(code)) return "Room codes never use O, 0, I or 1. Check the code on the host's screen.";
  if ([...code].some((c) => !ROOM_CODE_ALPHABET.includes(c))) return "Room codes only use letters and the numbers 2 to 9.";
  if (code.length < ROOM_CODE_LENGTH) return `That code is too short: room codes have ${ROOM_CODE_LENGTH} characters.`;
  return null;
}
