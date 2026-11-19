import { EXPLAINER_POINTS_PER_GUESSER, GUESSER_BASE_POINTS, MAX_SPEED_BONUS } from "@stemcharades/shared";
import { Screen, TextLink } from "../components/ui";

const steps = [
  ["One player explains.", "Only they see the card: a term, a formula or a question, with a list of words they must not say."],
  ["Everyone else guesses.", "Spelling slips are forgiven, and a near miss gets a “close” hint with no points."],
  ["The clock is running.", "A round lasts 60 or 90 seconds. It ends early when everyone has it, or the explainer skips."],
  ["Then the answer is explained.", "Every round ends with the right answer and why, so a wrong guess still teaches something."],
] as const;

export function Rules() {
  return (
    <Screen>
      <h1 className="text-3xl font-bold">How to play</h1>
      <ol className="w-full space-y-3 text-left">
        {steps.map(([title, detail], i) => (
          <li key={title} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="font-semibold">
              {i + 1}. {title}
            </p>
            <p className="mt-1 text-sm text-slate-300">{detail}</p>
          </li>
        ))}
      </ol>

      <section className="w-full text-left" aria-labelledby="points">
        <h2 id="points" className="text-xl font-semibold">
          Points
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
          <li>
            A correct guess scores {GUESSER_BASE_POINTS}, plus up to {MAX_SPEED_BONUS} more for speed.
          </li>
          <li>The explainer scores {EXPLAINER_POINTS_PER_GUESSER} for every player who gets it.</li>
          <li>If nobody gets it, nobody scores, and the card goes on the revision list.</li>
        </ul>
      </section>

      <section className="w-full text-left" aria-labelledby="clues">
        <h2 id="clues" className="text-xl font-semibold">
          Clues
        </h2>
        <p className="mt-2 text-slate-300">
          A typed clue is refused if it contains the answer or a forbidden word, in any capitals, as a plural, or split
          up to dodge the check. In Party mode you talk instead, and the room keeps you honest.
        </p>
      </section>

      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}
