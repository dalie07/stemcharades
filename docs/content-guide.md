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
| `answers` | Every accepted answer: abbreviations, alternative spellings, common aliases. Not shared with any other card at the same level (the same concept may have a card at each level). |
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
add a new one instead. Anything in the map with at least one card can be chosen in the game.

## Machine checks
`npm run validate:cards` (and the server, at start) rejects a deck if any card breaks the schema, sits outside the
curriculum map, shares an accepted answer with another card, forbids one of its own answers, contains blocked
language or a link, or is a question that prints its own answer. These checks catch mistakes of form, never a
wrong fact: that is what review is for.

## Drafting cards with AI
The step-by-step workflow, the prompts and a ready-made request for every subject and course are in
[content/prompts/](../content/prompts/README.md); `npm run cards:import` checks Claude's replies and adds the good
cards as drafts. Drafting is allowed, serving unreviewed drafts is not. A batch of drafted cards goes into the decks as `draft`,
passes the machine checks, and is then checked by a person like any other card. See
[decision 0002](decisions/0002-reviewed-cards-not-live-ai.md) for why cards are not generated during play.
