import type { RoomView, RoundOutcome } from "@stemcharades/shared";
import { FlagButton } from "../components/FlagButton";
import { Formula } from "../components/Formula";
import { useCountdown } from "../components/useCountdown";

const OUTCOME: Record<RoundOutcome, string> = {
  timeout: "Time's up",
  skipped: "Skipped",
  explainer_left: "The explainer left",
  all_guessed: "Everyone got it!",
};

export function Scores({ room }: { room: RoomView }) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <ol className="w-full space-y-1 text-left" aria-label="Scores">
      {sorted.map((p) => (
        <li key={p.id} className="flex justify-between rounded bg-slate-800 px-3 py-2">
          <span>{p.nickname}</span>
          <span className="font-semibold">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

export function Reveal({ room }: { room: RoomView }) {
  const reveal = room.reveal!;
  const round = room.round!;
  const left = useCountdown(reveal.nextAt);
  const last = round.number >= round.totalRounds;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center">
      <p className="text-sm text-slate-400">Round {round.number}/{round.totalRounds}</p>
      <h1 className="text-2xl font-bold">{OUTCOME[reveal.outcome]}</h1>
      <article className="w-full rounded-xl border border-slate-700 bg-slate-800 p-4 text-left shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">The answer</p>
        <h2 className="mt-1 text-2xl font-semibold">{reveal.answers[0]}</h2>
        {reveal.latex && <Formula latex={reveal.latex} />}
        <p className="mt-2 text-slate-300">{reveal.explanation}</p>
        <FlagButton card={{ id: reveal.cardId, prompt: reveal.prompt, subject: reveal.subject, topic: reveal.topic }} />
      </article>
      {reveal.awards.length > 0 && (
        <ul className="w-full space-y-1 text-left" aria-label="Points this round">
          {reveal.awards.map((a) => (
            <li key={a.playerId} className="flex justify-between rounded bg-green-950 px-3 py-2">
              <span>{room.players.find((p) => p.id === a.playerId)?.nickname}</span>
              <span className="font-semibold text-green-400">+{a.points}</span>
            </li>
          ))}
        </ul>
      )}
      {reveal.awards.length === 0 && <p className="text-slate-400">Nobody scored this round.</p>}
      <Scores room={room} />
      <p className="text-sm text-slate-400">{last ? "Final scores" : "Next round"} in {left}s</p>
    </main>
  );
}
