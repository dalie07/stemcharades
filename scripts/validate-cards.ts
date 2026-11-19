import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDeck, deckSchema, type Card } from "../shared/src/index.js";
import { contentProblems } from "../server/src/content/contentChecks.js";

// An optional directory argument lets tests point the validator at a deliberately broken deck.
const dir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content/decks");
const cards: Card[] = [];
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const parsed = deckSchema.safeParse(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
  if (!parsed.success) {
    failed = true;
    for (const i of parsed.error.issues) console.error(`${file}: ${i.path.join(".")}: ${i.message}`);
  } else cards.push(...parsed.data);
}
for (const p of [...checkDeck(cards), ...contentProblems(cards)]) {
  failed = true;
  console.error(p);
}

const reviewed = cards.filter((c) => c.status === "reviewed").length;
console.log(`${cards.length} cards, ${reviewed} reviewed`);
process.exit(failed ? 1 : 0);
