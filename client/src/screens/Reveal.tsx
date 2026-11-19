import type { RoomView, RoundOutcome } from "@stemcharades/shared";
import { CardFrame } from "../components/CardFrame";
import { FlagButton } from "../components/FlagButton";
import { ScoreList, Screen, mutedClass } from "../components/ui";
import { useCountdown } from "../hooks/useCountdown";

const OUTCOME: Record<RoundOutcome, string> = {
  all_guessed: "Everyone got it!",
  timeout: "Time's up",
  skipped: "Skipped",
  explainer_left: "The explainer left",
};

/** After every round: the answer, why it is the answer, and who scored. */
export function Reveal({ room }: { room: RoomView }) {
  const reveal = room.reveal!;
  const round = room.round!;
  const secondsLeft = useCountdown(reveal.nextAt);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "Player";
  const isLast = round.number >= round.totalRounds;
  const isQuestion = round.card.type === "question";

  return (
    <Screen>
      <p className={`text-sm ${mutedClass}`}>
        Round {round.number}/{round.totalRounds}
      </p>
      <h1 className="text-2xl font-bold">{OUTCOME[reveal.outcome]}</h1>

      {/* A term or formula card is its own answer, properly capitalised. A question card's answer is separate. */}
      <CardFrame
        eyebrow={isQuestion ? reveal.prompt : "The answer"}
        title={isQuestion ? reveal.answers[0]! : reveal.prompt}
        latex={reveal.latex}
        generated={reveal.generated}
      >
        <p className="mt-2 text-slate-300">{reveal.explanation}</p>
        <FlagButton card={{ id: reveal.cardId, prompt: reveal.prompt, subject: reveal.subject, topic: reveal.topic }} />
      </CardFrame>

      {reveal.awards.length > 0 ? (
        <ScoreList
          label="Points this round"
          rows={reveal.awards.map((award) => ({
            key: award.playerId,
            name: nameOf(award.playerId),
            score: <span className="text-green-400">+{award.points}</span>,
          }))}
        />
      ) : (
        <p className={mutedClass}>Nobody scored this round.</p>
      )}

      <h2 className="font-medium">Scores</h2>
      <ScoreList
        label="Scores"
        rows={[...room.players].sort((a, b) => b.score - a.score).map((p) => ({ key: p.id, name: p.nickname, score: p.score }))}
      />
      <p className={`text-sm ${mutedClass}`}>
        {isLast ? "Final scores" : "Next round"} in {secondsLeft}s
      </p>
    </Screen>
  );
}
