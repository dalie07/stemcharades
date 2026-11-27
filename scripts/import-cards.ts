/**
 * Add AI-drafted cards to the library.
 *
 *   npm run cards:import -- content/incoming/secondary-physics-1.json [more files...] [--dry-run]
 *
 * A file may hold Claude's reply exactly as copied: one or more ```json blocks, or plain JSON. Each batch is
 * { "course": "...", "cards": [ ... ] }. Good cards are appended to content/decks as drafts with new ids; every
 * refused card is written, with its reason, to <file>.rejected.json so it can be fixed or asked for again.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deckSchema, type Card } from "../shared/src/index.js";
import { importBatch, type Rejected } from "../server/src/content/importCards.js";

const decksDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content/decks");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) {
  console.error("Usage: npm run cards:import -- <file.json> [more files] [--dry-run]");
  process.exit(1);
}

/** Every JSON batch in a file: fenced ```json blocks if there are any, otherwise the whole file. */
function batchesIn(text: string): unknown[] {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]!);
  return (blocks.length ? blocks : [text]).flatMap((block) => {
    const parsed: unknown = JSON.parse(block);
    return Array.isArray(parsed) ? parsed : [parsed];
  });
}

const deckFiles = readdirSync(decksDir).filter((f) => f.endsWith(".json"));
const decks = new Map<string, Card[]>(deckFiles.map((f) => [f, deckSchema.parse(JSON.parse(readFileSync(path.join(decksDir, f), "utf8")))]));
const library = () => [...decks.values()].flat();

let added = 0;
let refused = 0;
for (const file of files) {
  let batches: unknown[];
  try {
    batches = batchesIn(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`${file}: could not read the JSON (${err instanceof Error ? err.message : err}). Copy Claude's reply again, complete.`);
    refused++;
    continue;
  }
  const rejected: Rejected[] = [];
  for (const batch of batches) {
    const result = importBatch(batch, library());
    rejected.push(...result.rejected);
    for (const card of result.accepted) decks.get(`${card.subject.toLowerCase()}.json`)!.push(card);
    const perTopic = new Map<string, number>();
    for (const c of result.accepted) perTopic.set(c.topic, (perTopic.get(c.topic) ?? 0) + 1);
    const course = (batch as { course?: string }).course ?? "?";
    console.log(`${file} · ${course}: ${result.accepted.length} added, ${result.rejected.length} refused`);
    for (const [topic, n] of perTopic) console.log(`   + ${n} in ${topic}`);
    added += result.accepted.length;
  }
  refused += rejected.length;
  if (rejected.length) {
    const out = file.replace(/(\.json|\.txt|\.md)?$/, ".rejected.json");
    writeFileSync(out, JSON.stringify(rejected.map((r) => ({ reason: r.reason, card: r.card })), null, 2) + "\n");
    console.log(`   ${rejected.length} refused, with reasons, in ${out}`);
    for (const r of rejected.slice(0, 8)) console.log(`   - ${r.reason}`);
    if (rejected.length > 8) console.log(`   … and ${rejected.length - 8} more`);
  }
}

if (dryRun) {
  console.log(`\nDry run: ${added} cards would be added. Nothing was written.`);
} else if (added) {
  for (const [file, cards] of decks) writeFileSync(path.join(decksDir, file), JSON.stringify(cards, null, 2) + "\n");
  console.log(`\n${added} cards added as drafts. Next: review them, set "status": "reviewed", then run npm run validate:cards.`);
} else {
  console.log("\nNo cards added.");
}
process.exit(refused && !added ? 1 : 0);
