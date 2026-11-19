import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AI_CARD_PREFIX,
  SUBJECTS,
  cardSchema,
  checkDeck,
  normalise,
  type Card,
  type Course,
} from "@stemcharades/shared";
import { isBlocked } from "../game/blocklist.js";
import { checkClue } from "../game/clueFilter.js";

/**
 * What the AI is asked to return for each card. Deliberately loose: every limit that matters is enforced
 * afterwards by `toCard`, so a model that ignores an instruction produces a rejected card, never a bad one.
 */
export const candidateSchema = z.object({
  type: z.enum(["term", "formula", "question"]),
  subject: z.enum(SUBJECTS),
  prompt: z.string(),
  /** KaTeX source for formula cards; an empty string otherwise. */
  latex: z.string(),
  answers: z.array(z.string()),
  forbidden: z.array(z.string()),
  explanation: z.string(),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const batchSchema = z.object({ cards: z.array(candidateSchema) });

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const uniqueBy = (items: string[], key: (s: string) => string) => {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = key(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const LINK = /https?:\/\/|www\./i;

/** A stable id from what the card is, so the same card written twice gets the same id and is dropped. */
export const aiCardId = (courseId: string, topic: string, prompt: string) =>
  AI_CARD_PREFIX + createHash("sha256").update(`${courseId}|${topic}|${normalise(prompt)}`).digest("hex").slice(0, 12);

export type Checked = { ok: true; card: Card } | { ok: false; reason: string };

/**
 * Turn one AI candidate into a card players may see, or say why not. The checks are the same ones the
 * reviewed library must pass (schema, curriculum map, answers versus forbidden words), plus the blocklist on
 * every word, no links, and no question that gives its own answer away.
 */
export function toCard(raw: unknown, course: Course, topic: string): Checked {
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  const c = parsed.data;

  const prompt = clean(c.prompt);
  const latex = clean(c.latex) || undefined;
  const subject = course.subjects.includes(c.subject) ? c.subject : course.subjects.length === 1 ? course.subjects[0]! : null;
  if (!subject) return { ok: false, reason: "subject outside the course" };

  let answers = uniqueBy(c.answers.map(clean), normalise);
  // On term and formula cards the prompt is itself the answer, so it must always be accepted.
  if (c.type !== "question" && !answers.some((a) => normalise(a) === normalise(prompt))) answers = [prompt, ...answers];
  answers = answers.slice(0, 10);
  const answerKeys = new Set(answers.map(normalise));
  const forbidden = uniqueBy(c.forbidden.map(clean), normalise)
    .filter((w) => !answerKeys.has(normalise(w)))
    .slice(0, 6);

  const card = {
    id: aiCardId(course.id, topic, prompt),
    type: c.type,
    subject,
    course: course.id,
    topic,
    level: course.level,
    prompt,
    ...(latex ? { latex } : {}),
    answers,
    forbidden,
    explanation: clean(c.explanation),
    status: "generated" as const,
  };

  const valid = cardSchema.safeParse(card);
  if (!valid.success) return { ok: false, reason: `invalid: ${valid.error.issues[0]?.message ?? "schema"}` };

  const text = [prompt, latex ?? "", card.explanation, ...answers, ...forbidden].join(" ");
  if (isBlocked(text)) return { ok: false, reason: "blocked language" };
  if (LINK.test(text)) return { ok: false, reason: "contains a link" };
  const problems = checkDeck([valid.data]);
  if (problems.length) return { ok: false, reason: problems[0]! };
  // A question that contains its own answer is no game. (Forbidden words in the question are fine: only the
  // explainer reads it.)
  const leak = c.type === "question" ? checkClue(prompt, valid.data) : { ok: true as const };
  if (!leak.ok && leak.reason === "contains_answer") return { ok: false, reason: "question gives away its answer" };
  return { ok: true, card: valid.data };
}
