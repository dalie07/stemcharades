import { normalise, pluralEqual, type Card, type ClueRejection } from "@stemcharades/shared";

export type ClueCheck = { ok: true } | ({ ok: false } & ClueRejection);

/** Lower-case words with apostrophes dropped ("Newton's" -> "newtons") and punctuation as spaces. */
function words(text: string): string[] {
  return normalise(text.replace(/['’]/g, "")).split(" ").filter(Boolean);
}

interface Blocked {
  original: string;
  stems: string[];
  reason: ClueRejection["reason"];
}

function blockedTerms(card: Card): Blocked[] {
  const out: Blocked[] = [];
  const add = (original: string, reason: Blocked["reason"]) => {
    const stems = words(original);
    if (stems.length) out.push({ original, stems, reason });
  };
  // On term and formula cards the prompt IS the answer. On question cards it is just the question.
  if (card.type !== "question") add(card.prompt, "contains_answer");
  // One- and two-letter answers ("he", "ml") are aliases for guessers. As clue words they would
  // reject ordinary English, so they are not enforced here (the prompt and forbidden list still are).
  // Numbers are the exception: "15" or "6" is never ordinary English, and typing it would hand over the answer.
  for (const a of card.answers) {
    const key = normalise(a).replace(/ /g, "");
    if (key.length >= 3 || /^\d+$/.test(key)) add(a, "contains_answer");
  }
  for (const f of card.forbidden) add(f, "forbidden_word");
  return out;
}

function hasPhrase(tokens: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((p, j) => pluralEqual(tokens[i + j]!, p))) return true;
  }
  return false;
}

/** A single blocked word written in pieces: "photo synthesis", "d n a". */
function hasSplitWord(raw: string[], word: string): boolean {
  if (word.length < 3) return false;
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= raw.length; i++) {
      const joined = raw.slice(i, i + n).join("");
      if (pluralEqual(joined, word)) return true;
    }
  }
  return false;
}

/** Allow or reject a typed clue for the current card. Whole words only, never substrings. */
export function checkClue(clue: string, card: Card): ClueCheck {
  const raw = words(clue);
  const tokens = raw;
  for (const b of blockedTerms(card)) {
    const hit =
      hasPhrase(tokens, b.stems) || (b.stems.length === 1 && hasSplitWord(raw, b.stems[0]!));
    if (hit) return { ok: false, reason: b.reason, word: b.original };
  }
  return { ok: true };
}
