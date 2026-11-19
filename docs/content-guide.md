# Content guide

Every card is pitched the same way. A wrong card teaches the wrong thing, so **no card moves from
`draft` to `reviewed` until a person has checked it against a textbook or course notes.**

## Card fields
| Field | Rule |
|---|---|
| `id` | `mat-`, `phy-`, `che-`, `bio-` or `com-` plus four digits. Permanent, never reused. |
| `type` | `term`, `formula` (needs `latex`) or `question`. |
| `level` | 1 school, 2 first-year university, 3 advanced. |
| `prompt` | What the explainer sees: the term, the formula's name, or the question. |
| `answers` | Every accepted answer: abbreviations, alternative spellings, common aliases. Not shared with any other card. |
| `forbidden` | 3–6 words the explainer may not use. The obvious giveaways: the main words in the answer's definition. Never an accepted answer itself. |
| `explanation` | Two or three sentences shown at reveal. Accurate, plain, no jokes. |
| `status` | `draft` until reviewed; only `reviewed` cards load in production. |

## Good and bad
- Good forbidden list for *Photosynthesis*: plants, light, glucose, chlorophyll, oxygen.
- Bad: padding with words nobody would say, or leaving out the single most obvious clue word.
- Good explanation: states what it is, then why it matters or one defining fact.
- Bad: restates the term, or is more than three sentences.
- Question cards need short, unambiguous answers (a name, a number, a unit).

## Workflow
1. Draft cards as `draft`. Drafts may be written by a person or generated; either way they are unreviewed.
2. `npm run validate:cards` – checks schema, duplicate ids, duplicate answers, forbidden-equals-answer.
3. A person checks each card against a trusted source, corrects it and sets `status: "reviewed"`.
4. CI runs the validator again; production loads reviewed cards only.
