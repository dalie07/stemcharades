/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if two words are the same word, or one is the plural of the other
 * ("cache"/"caches", "die"/"dies", "battery"/"batteries", "box"/"boxes").
 * Explicit suffix rules, not a stemmer: stemming disagrees with itself on words like "cache" and "die".
 */
export function pluralEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const isPluralOf = (plural: string, singular: string) =>
    singular.length >= 3 &&
    (plural === `${singular}s` ||
      plural === `${singular}es` ||
      (singular.endsWith("y") && plural === `${singular.slice(0, -1)}ies`));
  return isPluralOf(a, b) || isPluralOf(b, a);
}
