import { z } from "zod";
import {
  SUBJECT_PREFIX,
  cardSchema,
  checkDeck,
  getCourse,
  normalise,
  topicKey,
  type Card,
  type Subject,
} from "@stemcharades/shared";
import { contentProblems } from "./contentChecks.js";

/**
 * What an AI-drafted batch looks like (see content/prompts/README.md): one course, and cards with everything but
 * the bookkeeping. Deliberately loose here: every rule that matters is checked card by card below, so one bad card
 * is reported and skipped instead of failing the whole batch.
 */
const batchSchema = z.object({
  course: z.string(),
  cards: z.array(z.unknown()),
});
const candidateSchema = z.object({
  topic: z.string(),
  type: z.enum(["term", "formula", "question"]),
  subject: z.string().optional(),
  prompt: z.string(),
  latex: z.string().optional(),
  answers: z.array(z.string()),
  forbidden: z.array(z.string()),
  explanation: z.string(),
});

export interface Rejected {
  card: unknown;
  reason: string;
}
export interface ImportResult {
  accepted: Card[];
  rejected: Rejected[];
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const unique = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = normalise(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Turn a drafted batch into library cards: assigns each a permanent id and `status: "draft"`, fills in the level
 * from the course, tidies answers and forbidden words, and runs every check the library itself must pass, plus
 * no repeated prompt in a topic and no answer already owned by another card at the same level. Pure: the caller
 * writes the result.
 */
export function importBatch(raw: unknown, library: readonly Card[]): ImportResult {
  const batch = batchSchema.safeParse(raw);
  if (!batch.success) return { accepted: [], rejected: [{ card: raw, reason: 'not a batch: expected { "course": "...", "cards": [ ... ] }' }] };
  const course = getCourse(batch.data.course);
  if (!course) {
    return {
      accepted: [],
      rejected: batch.data.cards.map((card) => ({ card, reason: `unknown course "${batch.data.course}"` })),
    };
  }

  const accepted: Card[] = [];
  const rejected: Rejected[] = [];
  const answerOwner = new Map<string, string>();
  const promptsByTopic = new Map<string, Set<string>>();
  const nextNumber = new Map<string, number>();
  const remember = (card: Card) => {
    // Answers are unique within a level, so the same concept can be explained at Primary and at Secondary.
    for (const a of card.answers) if (!answerOwner.has(`${card.level}:${normalise(a)}`)) answerOwner.set(`${card.level}:${normalise(a)}`, card.id);
    const key = topicKey(card.course, card.topic);
    promptsByTopic.set(key, (promptsByTopic.get(key) ?? new Set()).add(normalise(card.prompt)));
    const [prefix, n] = card.id.split("-");
    nextNumber.set(prefix!, Math.max(nextNumber.get(prefix!) ?? 1, Number(n) + 1));
  };
  library.forEach(remember);

  for (const raw of batch.data.cards) {
    const reject = (reason: string) => rejected.push({ card: raw, reason });
    const parsed = candidateSchema.safeParse(raw);
    if (!parsed.success) {
      reject(`missing or wrong field: ${parsed.error.issues[0]?.path.join(".") || "card"}`);
      continue;
    }
    const c = parsed.data;
    const topic = course.topics.find((t) => t.toLowerCase() === tidy(c.topic).toLowerCase());
    if (!topic) {
      reject(`"${c.topic}" is not a topic of ${course.id}: add it to the curriculum map first`);
      continue;
    }
    const subject = (course.subjects.length === 1 ? course.subjects[0] : course.subjects.find((s) => s === c.subject)) as Subject | undefined;
    if (!subject) {
      reject(`subject must be one of ${course.subjects.join(", ")} for ${course.id}`);
      continue;
    }

    const prompt = tidy(c.prompt);
    let answers = unique(c.answers.map(tidy));
    // On term and formula cards the prompt is itself the answer, so it must always be accepted.
    if (c.type !== "question" && !answers.some((a) => normalise(a) === normalise(prompt))) answers = [prompt, ...answers];
    const answerKeys = new Set(answers.map(normalise));
    const forbidden = unique(c.forbidden.map(tidy)).filter((w) => !answerKeys.has(normalise(w)));
    const latex = c.latex ? tidy(c.latex) : "";
    const prefix = SUBJECT_PREFIX[subject];
    const number = nextNumber.get(prefix) ?? 1;

    const card = {
      id: `${prefix}-${String(number).padStart(4, "0")}`,
      type: c.type,
      subject,
      course: course.id,
      topic,
      level: course.level,
      prompt,
      ...(latex ? { latex } : {}),
      answers: answers.slice(0, 10),
      forbidden: forbidden.slice(0, 6),
      explanation: tidy(c.explanation),
      status: "draft" as const,
    };

    const valid = cardSchema.safeParse(card);
    if (!valid.success) {
      const issue = valid.error.issues[0];
      reject(`${issue?.path.join(".") || "card"}: ${issue?.message ?? "invalid"}`);
      continue;
    }
    const problems = [...checkDeck([valid.data]), ...contentProblems([valid.data])];
    if (problems.length) {
      reject(problems[0]!.replace(`${card.id}: `, ""));
      continue;
    }
    if (promptsByTopic.get(topicKey(course.id, topic))?.has(normalise(prompt))) {
      reject(`"${prompt}" is already a card in ${topic}`);
      continue;
    }
    const taken = answers.find((a) => answerOwner.has(`${course.level}:${normalise(a)}`));
    if (taken) {
      reject(`answer "${taken}" already belongs to ${answerOwner.get(`${course.level}:${normalise(taken)}`)}`);
      continue;
    }
    accepted.push(valid.data);
    remember(valid.data);
  }
  return { accepted, rejected };
}
