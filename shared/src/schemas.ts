import { z } from "zod";

export const SUBJECTS = ["Maths", "Physics", "Chemistry", "Biology", "Computing"] as const;
export const SUBJECT_PREFIX = {
  Maths: "mat",
  Physics: "phy",
  Chemistry: "che",
  Biology: "bio",
  Computing: "com",
} as const;

/** The fields every card has, whether it is a built-in card or a user's custom card. */
const cardFields = {
  type: z.enum(["term", "formula", "question"]),
  subject: z.enum(SUBJECTS),
  topic: z.string().min(2).max(60),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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

export const cardSchema = z
  .object({
    id: z.string().regex(/^(mat|phy|che|bio|com)-\d{4}$/, "id must look like phy-0042"),
    ...cardFields,
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
  });

export type Card = z.infer<typeof cardSchema>;
export const deckSchema = z.array(cardSchema);
