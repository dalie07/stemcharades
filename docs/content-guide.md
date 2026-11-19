# Content guide

Every card is pitched the same way. A wrong card teaches the wrong thing, so **no card moves from
`draft` to `reviewed` until a person has checked it against a textbook or course notes.**

## Card fields
| Field | Rule |
|---|---|
| `id` | `mat-`, `phy-`, `che-`, `bio-` or `com-` plus four digits. Permanent, never reused. |
| `type` | `term`, `formula` (needs `latex`) or `question`. |
| `level` | 1 Primary, 2 Secondary, 3 University, 4 Advanced. Must match the course's level. |
| `course` | A subject (Primary, Secondary) or course (University, Advanced) from the curriculum map in `shared/src/taxonomy.ts`, e.g. `secondary-physics`, `university-calculus`. |
| `topic` | One of that course's topics in the map, spelled exactly, e.g. `Waves`. |
| `subject` | The broad discipline (Maths, Physics, Chemistry, Biology, Computing). Sets the id prefix and must be one the course covers. |
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

## The curriculum map
`shared/src/taxonomy.ts` lists every level, subject or course, and topic. It is generic rather than tied to one
country's syllabus. The validator rejects a card whose course or topic is not in the map, so new parts of the
curriculum start there: add the course or topic, then cards for it. Never rename an id that cards already use;
add a new one instead. Anything in the map can be chosen in the game, and the AI (when it is switched on) can
write cards for it.

## AI-written cards
When AI writing is switched on, the game also writes cards during play for whatever players choose. They are not
in Git and are never marked `reviewed`. Instead every one must pass the same checks as the library (schema,
curriculum map, answers versus forbidden words, no answer shared with another card) plus the blocklist, no links,
and no question that contains its own answer. They carry an **AI-written** label, and two players' reports take
one out of the game at once. They supplement the reviewed library; they never replace it.
