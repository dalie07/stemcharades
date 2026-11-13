import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkDeck, deckSchema, type Card } from "@stemcharades/shared";

/**
 * Load and validate every deck file. Throws on any problem so the server
 * refuses to start with a broken deck. Production loads reviewed cards only.
 */
export function loadDecks(dir: string, opts: { reviewedOnly: boolean }): Card[] {
  const all: Card[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const raw: unknown = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const parsed = deckSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`${file}: ${issue?.path.join(".")}: ${issue?.message}`);
    }
    all.push(...parsed.data);
  }
  const problems = checkDeck(all);
  if (problems.length) throw new Error(`Invalid decks:\n${problems.join("\n")}`);
  return opts.reviewedOnly ? all.filter((c) => c.status === "reviewed") : all;
}
