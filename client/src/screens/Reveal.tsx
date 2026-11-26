import { useEffect, useRef } from "react";
import type { RoomView, RoundOutcome } from "@stemcharades/shared";
import { CardFrame } from "../components/CardFrame";
import { Dust } from "../components/Dust";
import { FlagButton } from "../components/FlagButton";
import { Heading, ScoreList, Screen, mutedClass } from "../components/ui";
import { useCountdown } from "../hooks/useCountdown";
import { cue } from "../lib/feedback";
import type { Session } from "../state/gameStore";
import { useProgress } from "../state/progress";

const OUTCOME: Record<RoundOutcome, string> = {
  all_guessed: "Everyone got it!",
  timeout: "Time's up",
  skipped: "Skipped",
  explainer_left: "The explainer left",
};

/**
 * This device's run of correct guesses across rounds, for the "On fire" celebration. Rounds this player
 * explained neither extend nor break it. Kept outside React so it survives the screen changing each round.
 */
const run = { room: "", round: 0, count: 0 };

/** After every round: the answer, why it is the answer, and who scored. */
export function Reveal({ room, session }: { room: RoomView; session: Session }) {
  const reveal = room.reveal!;
  const round = room.round!;
  const secondsLeft = useCountdown(reveal.nextAt);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "Player";
  const isLast = round.number >= round.totalRounds;
  const isQuestion = round.card.type === "question";
  const { record, played } = useProgress();
  const handled = useRef(false);

  const explained = round.explainerId === session.playerId;
  const gotIt = explained ? round.guessedCorrect.length > 0 : round.guessedCorrect.includes(session.playerId);

  // Once per round: remember the result on this device and update the run.
  if (run.room !== room.code || run.round > round.number) Object.assign(run, { room: room.code, round: 0, count: 0 });
  if (run.round !== round.number) {
    run.round = round.number;
    if (!explained) run.count = gotIt ? run.count + 1 : 0;
  }
  const onFire = !explained && gotIt && run.count >= 3;

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    played();
    // Private custom-deck cards are not part of the curriculum, so they earn no stars.
    if (reveal.course !== "custom") record({ id: reveal.cardId, course: reveal.course, topic: reveal.topic }, gotIt);
    cue(onFire ? "combo" : "reveal");
  }, [played, record, reveal, gotIt, onFire]);

  return (
    <Screen>
      <p className={`font-hand text-xl ${mutedClass}`}>
        Round {round.number}/{round.totalRounds}
      </p>
      <div className="relative">
        <Heading>{OUTCOME[reveal.outcome]}</Heading>
        {reveal.outcome === "all_guessed" && <Dust count={18} />}
      </div>
      {onFire && (
        <p role="status" className="pop relative rounded-full bg-accent px-4 py-1 font-hand text-2xl text-accent-ink">
          On fire! {run.count} in a row
          <Dust />
        </p>
      )}

      {/* A term or formula card is its own answer, properly capitalised. A question card's answer is separate. */}
      <CardFrame
        eyebrow={isQuestion ? reveal.prompt : "The answer"}
        title={isQuestion ? reveal.answers[0]! : reveal.prompt}
        latex={reveal.latex}
        subject={reveal.subject}
      >
        <p className="mt-2 text-ink-muted">{reveal.explanation}</p>
        <FlagButton card={{ id: reveal.cardId, prompt: reveal.prompt, subject: reveal.subject, topic: reveal.topic }} />
      </CardFrame>

      {reveal.awards.length > 0 ? (
        <ScoreList
          label="Points this round"
          rows={reveal.awards.map((award) => ({
            key: award.playerId,
            name: nameOf(award.playerId),
            score: <span className="text-good">+{award.points}</span>,
          }))}
        />
      ) : (
        <p className={mutedClass}>Nobody scored this round.</p>
      )}

      <h2 className="font-chalk text-2xl">Scores</h2>
      <ScoreList
        label="Scores"
        rows={[...room.players].sort((a, b) => b.score - a.score).map((p) => ({ key: p.id, name: p.nickname, score: p.score }))}
      />
      <p className={`font-hand text-lg ${mutedClass}`}>
        {isLast ? "Final scores" : "Next round"} in {secondsLeft}s
      </p>
    </Screen>
  );
}
