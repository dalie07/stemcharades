import { normalise } from "@stemcharades/shared";

/**
 * A basic screen for nicknames and clues, not a moderation system. Whole words only (so "class" is
 * fine), with common leetspeak and repeated letters folded away. The host can also remove players.
 * Extend this list as playtests show gaps.
 */
const WORDS = [
  "fuck", "fucker", "fucking", "motherfucker", "shit", "shitty", "bullshit", "bitch", "bastard",
  "asshole", "arsehole", "dick", "dickhead", "cock", "cunt", "pussy", "whore", "slut", "twat",
  "wanker", "bollocks", "piss", "nigger", "nigga", "faggot", "fag", "retard", "retarded", "spastic",
  "rapist", "nazi", "hitler", "kys",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", $: "s", "7": "t" };

const fold = (word: string) => word.replace(/(.)\1+/g, "$1");
const BLOCKED = new Set(WORDS.map(fold));

function tokens(text: string): string[] {
  const unleet = [...text].map((c) => LEET[c] ?? c).join("");
  return normalise(unleet).split(" ").filter(Boolean);
}

export function isBlocked(text: string): boolean {
  const words = tokens(text);
  if (words.some((w) => BLOCKED.has(fold(w)))) return true;
  // Letters spread out to dodge the filter: "f u c k" or "s h i t".
  const squashed = fold(words.join(""));
  return words.length >= 3 && words.every((w) => w.length === 1) && BLOCKED.has(squashed);
}
