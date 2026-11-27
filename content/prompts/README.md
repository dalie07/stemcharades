# Growing the card library with Claude

Claude drafts cards; the import command checks them and adds them as drafts; a person reviews every card before it
is marked `reviewed` and reaches players. Nothing Claude writes goes into the game unchecked.

| File | What it is |
|---|---|
| [curriculum.md](curriculum.md) | Every level, subject or course, and topic the game covers, with how many cards each has now |
| [courses/](courses/) | One ready-to-paste request per subject or course: its topics, how many cards each still needs, and what already exists |
| This file | The workflow, Prompt A (new courses and topics) and Prompt B (the card-writing rules) |

## The workflow

1. **Open a new chat at claude.ai.** Use the most capable model available: accuracy matters more than speed.
2. **Paste Prompt B** (below) as the first message. Claude replies that it is ready.
3. **Paste one course request** from [courses/](courses/), everything below its line. Claude replies with JSON for
   two topics.
4. **Save each reply.** Click Claude's copy button on the reply and paste it into a new file in `content/incoming/`,
   for example `content/incoming/university-calculus-1.json`. The code fences can stay in.
5. **Say "next"** to Claude for the next two topics, and save that reply as `...-2.json`, and so on.
6. **Import:**
   ```bash
   npm run cards:import -- content/incoming/university-calculus-*.json
   ```
   Good cards are added to `content/decks/` as drafts with new ids. Refused cards are listed with the reason and
   saved to `*.rejected.json` beside the file you imported: paste that file back to Claude and ask it to fix and
   resend those cards.
7. **Review** the new cards with the review tool:
   ```bash
   npm run review        # then open http://localhost:4321
   ```
   It shows one draft at a time, styled like the game's cards. Check it against a textbook, then press
   **Approve** (or the A key), **Edit** to fix it (E), **Skip** (→), or **Delete draft** if it is not worth fixing.
   Every save is checked like `npm run validate:cards`, so a broken card cannot be saved. The tool runs only on
   your own computer and is never part of the live game.
8. **Refresh the requests** with `npm run cards:prompts`, so the next request knows what now exists. Commit with a
   message starting `content:`.

One course per chat keeps Claude focused. Start a new chat (and paste Prompt B again) for each course.

### What the import checks

Every card must fit the curriculum map (a real course and topic), have 3 to 6 forbidden words, 1 to 10 answers,
an explanation of 20 to 500 characters and LaTeX for formulas. It must not repeat a prompt in its topic, share an
answer with another card at the same level, forbid one of its own answers, contain rude words or links, or be a question that
prints its own answer. The import fills in the id, level and status itself.

### How much is left

The game has 229 topics. At 25 cards per topic that is about 5,300 new cards: roughly 400 Primary, 1,400
Secondary, 2,200 University and 1,400 Advanced. Every one needs a person's review, so work in priority order:
the subjects your players use most, Primary and Secondary first.

---

## Prompt A: suggest new courses and topics (optional)

The curriculum already has 19 University and 17 Advanced courses (see [curriculum.md](curriculum.md)), which is
enough to start. Use this prompt only if you want broader coverage. Bring Claude's answer to a developer (or to
Claude Code): new courses and topics are added to `shared/src/taxonomy.ts` before cards can be written for them.

Copy everything inside the box:

````text
You are helping plan the curriculum of STEMCHARADES, a free party game for revising STEM. One player explains a
term, formula or question without saying forbidden words; the others guess. It covers five subjects only: Maths,
Physics, Chemistry, Biology and Computing, at four levels: Primary (ages 5 to 11), Secondary (11 to 18),
University (undergraduate) and Advanced (final-year undergraduate, postgraduate and specialist). The curriculum is
generic and international, not tied to one country's syllabus.

Below is the current curriculum. Suggest what is missing at University and Advanced level (and at Primary or
Secondary only if something important is absent):
1. New courses that a typical university STEM degree in these five subjects would teach and that are not covered.
2. New topics inside existing courses, where a course is missing an important area.

Rules:
- Only standard, well-established material. No niche research areas, no duplicates of existing courses or topics.
- Each course needs 3 to 7 topics, each topic broad enough for at least 25 distinct cards (terms, formulas or
  short-answer questions).
- Course ids are lowercase with hyphens and start with the level: "university-..." or "advanced-...".
- Topic names are short (1 to 4 words), in sentence case, like the existing ones.
- At most 8 new courses in total. Quality over quantity. If the curriculum is already good enough, say so.

Reply with ONE JSON code block in exactly this shape, then at most five lines explaining your choices:

```json
{
  "newCourses": [
    { "level": 3, "id": "university-databases", "name": "Databases", "subject": "Computing",
      "topics": ["Relational model", "SQL", "Normalisation", "Transactions"] }
  ],
  "newTopics": [
    { "course": "university-programming", "topics": ["Testing"] }
  ]
}
```

The current curriculum:

[PASTE THE CONTENTS OF content/prompts/curriculum.md HERE]
````

---

## Prompt B: the card-writing rules

Paste this as the first message of each chat, then a course request from [courses/](courses/).

Copy everything inside the box:

````text
You are writing cards for STEMCHARADES, a free party game for revising STEM, used by students from primary school
to postgraduate level, including children. One player sees a card and explains it to their team without saying
the answer or any of the card's forbidden words; the others type or shout guesses. After the round everyone sees
the answer and a short explanation, so every card also teaches.

I will give you a subject or course, its level, its topics and how many cards each topic needs. Write that many
new cards per topic, following every rule below.

THE THREE CARD TYPES
- term: the prompt is the concept itself, which is what the players must guess. Example: "Wavelength".
- formula: the prompt is the formula's name, and "latex" is the formula in KaTeX syntax. Example: prompt "Ohm's
  law", latex "V = IR". Only for real, named formulas.
- question: a short question whose answer is one word, a name or a number with its unit. Example: "How many
  chromosomes are in a human body cell?" with answers ["46", "forty-six"].
Aim for roughly 60% terms, 20% questions and 20% formulas in topics that have formulas; topics without formulas
get terms and questions only.

RULES FOR EVERY CARD
1. Correct and uncontroversial: the standard definition found in textbooks worldwide. No country-specific
   content, no trick questions, no living people, nothing unsuitable for children. Never invent facts: if you are
   not certain, leave the card out.
2. Pitched at the level given. Primary cards use everyday words and simple ideas; Advanced cards use specialist
   concepts. Each card must belong to its topic.
3. prompt: at most 120 characters.
4. answers: the main answer first, then accepted alternatives: abbreviations, other spellings, common synonyms
   (for example ["deoxyribonucleic acid", "dna"]). For term and formula cards the first answer is the prompt
   itself. 1 to 10 answers, each at most 100 characters. Numbers as digits, plus the words if short ("46",
   "forty-six"). Never an answer that belongs to a different concept.
5. forbidden: 3 to 6 words or very short phrases (2 to 40 characters each): the most obvious words someone would
   naturally use to explain this card. Never one of the accepted answers.
6. explanation: 2 or 3 plain sentences, 20 to 400 characters: what it is, and one key fact or why it matters.
7. A question must not contain its own answer.
8. No two cards may share an answer, in your reply or across the chat. Do not reuse anything I list as already in
   the library. (The same concept may exist at another level; that is fine.)
9. No links, no emoji, no markdown inside the text fields.

OUTPUT FORMAT
Reply with ONE JSON code block and nothing else, in exactly this shape:

```json
{
  "course": "secondary-physics",
  "cards": [
    {
      "topic": "Waves",
      "type": "term",
      "prompt": "Amplitude",
      "answers": ["amplitude"],
      "forbidden": ["height", "maximum", "displacement", "wave"],
      "explanation": "The amplitude is the largest distance a wave moves from its rest position. A bigger amplitude carries more energy, such as a louder sound."
    },
    {
      "topic": "Waves",
      "type": "formula",
      "prompt": "Wave speed equation",
      "latex": "v = f \\lambda",
      "answers": ["wave speed equation", "wave equation"],
      "forbidden": ["frequency", "wavelength", "speed", "multiply"],
      "explanation": "Wave speed equals frequency times wavelength. It holds for every kind of wave, from sound to light."
    },
    {
      "topic": "Waves",
      "type": "question",
      "prompt": "What is the unit of frequency?",
      "answers": ["hertz", "hz"],
      "forbidden": ["waves", "per second", "cycles", "frequency"],
      "explanation": "Frequency is measured in hertz. One hertz means one complete wave passes each second."
    }
  ]
}
```

- "topic" must be spelled exactly as I give it.
- Only give "subject" when I ask for it (courses that span several subjects).
- In "latex", escape backslashes as JSON requires ("\\frac", "\\lambda").
- Two topics per reply, so every reply is complete and valid JSON. When I say "next", continue with the next two
  topics. Never stop in the middle of a card.

Reply "Ready." now, and wait for my first request.
````
