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
      <h1 className="font-chalk text-4xl">How to play</h1>
      <ol className="w-full space-y-3 text-left">
        {steps.map(([title, detail], i) => (
          <li key={title} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-semibold">
              {i + 1}. {title}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{detail}</p>
          </li>
        ))}
      </ol>

      <section className="w-full text-left" aria-labelledby="online">
        <h2 id="online" className="font-chalk text-2xl">
          Playing online
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-muted">
          <li>
            One person taps <strong className="text-ink">Online room → Create a room</strong> and types a nickname. They are the host.
          </li>
          <li>The host's screen shows a 5-character room code and a QR code.</li>
          <li>
            Everyone else taps <strong className="text-ink">Online room → Join a room</strong>, types the code and a nickname, then{" "}
            <strong className="text-ink">Join room</strong>. Or they scan the QR code with their phone camera, and the code is filled in.
          </li>
          <li>The host taps “Change what to play” to pick levels, subjects and topics, then Start game. You need at least two players.</li>
          <li>Players take turns to explain. The explainer types clues; everyone else types guesses on their own phone.</li>
        </ol>
        <p className="mt-2 text-sm text-ink-muted">
          Room codes use letters and the numbers 2 to 9, never O, 0, I or 1. If you refresh or lose signal, you get your seat back.
        </p>
      </section>

      <section className="w-full text-left" aria-labelledby="party">
        <h2 id="party" className="font-chalk text-2xl">
          Party mode
        </h2>
        <p className="mt-2 text-ink-muted">
          One phone, passed around. The explainer reads the card and talks; the others shout guesses. Tap Got it or Skip. It works
          with no internet once the cards have loaded.
        </p>
      </section>

      <section className="w-full text-left" aria-labelledby="points">
        <h2 id="points" className="font-chalk text-2xl">
          Points
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
          <li>
            A correct guess scores {GUESSER_BASE_POINTS}, plus up to {MAX_SPEED_BONUS} more for speed.
          </li>
          <li>The explainer scores {EXPLAINER_POINTS_PER_GUESSER} for every player who gets it.</li>
          <li>If nobody gets it, nobody scores, and the card goes on the revision list.</li>
        </ul>
      </section>

      <section className="w-full text-left" aria-labelledby="clues">
        <h2 id="clues" className="font-chalk text-2xl">
          Clues
        </h2>
        <p className="mt-2 text-ink-muted">
          A typed clue is refused if it contains the answer or a forbidden word, in any capitals, as a plural, or split
          up to dodge the check. In Party mode you talk instead, and the room keeps you honest.
        </p>
      </section>

      <section className="w-full text-left" aria-labelledby="learn">
        <h2 id="learn" className="font-chalk text-2xl">
          Learn as you play
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
          <li>Every topic has three stars. Get its cards right to fill them; miss one again and you lose that star until you relearn it.</li>
          <li>Cards you miss are saved. Choose “Revise my misses” in Party mode, and they also come back in later games until you get them.</li>
          <li>Play on consecutive days to build a streak.</li>
          <li>All of this stays on your device: no account needed.</li>
        </ul>
      </section>

      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}
