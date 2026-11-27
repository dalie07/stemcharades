import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cardSchema, checkDeck, deckSchema, normalise, type Card } from "@stemcharades/shared";
import { contentProblems } from "./contentChecks.js";

/**
 * The card review tool's model: the decks as files (one per subject), and the edits a reviewer makes. Every change
 * is checked against the same rules as the validator before it is kept, so the tool can never save a broken deck.
 * Used only by the local review tool (`npm run review`), never by the game server.
 */
export type Decks = Map<string, Card[]>;

export function readDecks(dir: string): Decks {
  return new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => [f, deckSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")))]),
  );
}

export function writeDeck(dir: string, file: string, cards: Card[]): void {
  writeFileSync(path.join(dir, file), JSON.stringify(cards, null, 2) + "\n");
}

/** The fields a reviewer may change. The id, subject and course stay fixed. */
export interface CardEdit {
  type?: Card["type"];
  topic?: string;
  prompt?: string;
  latex?: string;
  answers?: string[];
  forbidden?: string[];
  explanation?: string;
  status?: Card["status"];
}

export type EditResult = { ok: true; card: Card; file: string } | { ok: false; problems: string[] };

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const unique = (items: string[]) => {
  const seen = new Set<string>();
  return items.map(tidy).filter((x) => {
    const k = normalise(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function locate(decks: Decks, id: string): { file: string; index: number } | null {
  for (const [file, cards] of decks) {
    const index = cards.findIndex((c) => c.id === id);
    if (index >= 0) return { file, index };
  }
  return null;
}

/**
 * Apply a reviewer's edit (or just a status change). The card is tidied the way the importer tidies cards (answers
 * deduplicated, the prompt of a term or formula always accepted, no forbidden word that is also an answer) and the
 * whole library is re-checked with it in place. On any problem nothing changes and the problems are returned.
 */
export function editCard(decks: Decks, id: string, edit: CardEdit): EditResult {
  const at = locate(decks, id);
  if (!at) return { ok: false, problems: [`no card ${id}`] };
  const before = decks.get(at.file)![at.index]!;

  const type = edit.type ?? before.type;
  const prompt = edit.prompt !== undefined ? tidy(edit.prompt) : before.prompt;
  let answers = edit.answers !== undefined ? unique(edit.answers) : before.answers;
  if (type !== "question" && !answers.some((a) => normalise(a) === normalise(prompt))) answers = [prompt, ...answers];
  const answerKeys = new Set(answers.map(normalise));
  const forbidden = (edit.forbidden !== undefined ? unique(edit.forbidden) : before.forbidden).filter((w) => !answerKeys.has(normalise(w)));
  const latex = edit.latex !== undefined ? tidy(edit.latex) : (before.latex ?? "");

  const candidate = {
    id: before.id,
    type,
    subject: before.subject,
    course: before.course,
    topic: edit.topic !== undefined ? tidy(edit.topic) : before.topic,
    level: before.level,
    prompt,
    ...(latex ? { latex } : {}),
    answers,
    forbidden,
    explanation: edit.explanation !== undefined ? tidy(edit.explanation) : before.explanation,
    status: edit.status ?? before.status,
  };

  const parsed = cardSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "card"}: ${i.message}`) };
  const card = parsed.data;
  const problems = [...checkDeck([card]), ...contentProblems([card])].map((p) => p.replace(`${id}: `, ""));
  // Answers are unique within a level.
  const others = [...decks.values()].flat().filter((c) => c.id !== id && c.level === card.level);
  for (const a of card.answers) {
    const owner = others.find((c) => c.answers.some((b) => normalise(b) === normalise(a)));
    if (owner) problems.push(`answer "${a}" is also an answer of ${owner.id} at the same level`);
  }
  if (problems.length) return { ok: false, problems };

  decks.get(at.file)![at.index] = card;
  return { ok: true, card, file: at.file };
}

/**
 * Remove a draft that is not worth fixing. Reviewed cards cannot be deleted here: once players may have seen a
 * card its id is permanent (statistics refer to it), so a bad reviewed card is corrected instead.
 */
export function deleteDraft(decks: Decks, id: string): { ok: true; file: string } | { ok: false; problems: string[] } {
  const at = locate(decks, id);
  if (!at) return { ok: false, problems: [`no card ${id}`] };
  const card = decks.get(at.file)![at.index]!;
  if (card.status !== "draft") return { ok: false, problems: ["only drafts can be deleted; correct a reviewed card instead"] };
  decks.get(at.file)!.splice(at.index, 1);
  return { ok: true, file: at.file };
}
