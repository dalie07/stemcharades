# Reviewed cards, not cards generated during play

**Decision.** Cards are written ahead of time (by people, or drafted with AI), checked by machine and by a person,
and committed to Git. The game does not call an AI model while people play.

**Why.**
- **Cost.** The project runs on $0. No AI API that could write good cards was free for this use.
- **Terms.** Google's Gemini API terms (Age Requirements) forbid using it in an app "directed towards or likely to
  be accessed by individuals under the age of 18". With Primary and Secondary levels, STEMCHARADES is such an
  app, so the free Gemini tier was ruled out. Anthropic allows apps used by minors with safeguards, but is paid.
- **Accuracy.** A wrong card teaches the wrong thing. Review by a person is the only check that catches a subtly
  wrong fact; machine checks catch mistakes of form.

**What we kept.** The machine checks written for AI cards (blocked language, links, questions that print their own
answer) now run on every library card, in `npm run validate:cards` and at server start.

**If this changes.** A complete, tested implementation of live AI cards (checked before use, a daily spend cap, a
circuit breaker, player reports, persistence and a picker that warms topics in advance) is preserved on the
`ai-cards` branch. It needs a writer for an approved provider, a funded key, and the safeguards that provider
requires for young users, such as an AI-content label and published child-privacy compliance.
