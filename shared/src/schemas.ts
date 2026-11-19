import { z } from "zod";
import { SUBJECTS, getCourse, type Subject } from "./taxonomy.js";

export const SUBJECT_PREFIX: Record<Subject, string> = {
  Maths: "mat",
  Physics: "phy",
  Chemistry: "che",
  Biology: "bio",
  Computing: "com",
};

export const levelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/** The fields every card has, whether it is a built-in card or a user's custom card. */
const cardFields = {
  type: z.enum(["term", "formula", "question"]),
  subject: z.enum(SUBJECTS),
  topic: z.string().min(2).max(60),
  level: levelSchema,
  prompt: z.string().min(2).max(200),
  latex: z.string().min(1).max(300).optional(),
  answers: z.array(z.string().min(1).max(100)).min(1).max(10),
  forbidden: z.array(z.string().min(2).max(40)).min(3).max(6),
  explanation: z.string().min(20).max(500),
};

/** A card a signed-in user writes for their own private deck. It has no permanent id or review status. */
export const customCardSchema = z
  .object(cardFields)
  .strict()
  .superRefine((card, ctx) => {
    if (card.type === "formula" && !card.latex) {
      ctx.addIssue({ code: "custom", path: ["latex"], message: "formula cards need latex" });
    }
  });
export type CustomCard = z.infer<typeof customCardSchema>;

/** A card in the library in Git. Its course and topic must exist in the curriculum map. */
export const cardSchema = z
  .object({
    id: z.string().regex(/^(mat|phy|che|bio|com)-\d{4}$/, "id must look like phy-0042"),
    ...cardFields,
    course: z.string().min(2).max(60),
    status: z.enum(["draft", "reviewed"]),
  })
  .strict()
  .superRefine((card, ctx) => {
    if (card.type === "formula" && !card.latex) {
      ctx.addIssue({ code: "custom", path: ["latex"], message: "formula cards need latex" });
    }
    if (!card.id.startsWith(SUBJECT_PREFIX[card.subject])) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: `id prefix must be ${SUBJECT_PREFIX[card.subject]} for ${card.subject}`,
      });
    }
    const course = getCourse(card.course);
    if (!course) {
      ctx.addIssue({ code: "custom", path: ["course"], message: `unknown course "${card.course}"` });
      return;
    }
    if (course.level !== card.level) {
      ctx.addIssue({ code: "custom", path: ["level"], message: `${card.course} is a level ${course.level} course` });
    }
    if (!course.subjects.includes(card.subject)) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: `${card.course} does not cover ${card.subject}` });
    }
    if (!course.topics.includes(card.topic)) {
      ctx.addIssue({ code: "custom", path: ["topic"], message: `"${card.topic}" is not a topic of ${card.course}` });
    }
  });

export type Card = z.infer<typeof cardSchema>;
export const deckSchema = z.array(cardSchema);
