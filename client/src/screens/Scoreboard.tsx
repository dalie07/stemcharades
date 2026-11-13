import type { RoomView } from "@stemcharades/shared";
import type { Session } from "../state/gameStore";
import { FlagButton } from "../components/FlagButton";
import { Formula } from "../components/Formula";
import { leaveRoom, startGame } from "../state/socket";

export function Scoreboard({ room, session }: { room: RoomView; session: Session }) {
  const summary = room.summary;
  const isHost = room.hostId === session.playerId;
  if (!summary) return null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-bold">Final scores</h1>
      <ol className="w-full space-y-1 text-left" aria-label="Final standings">
        {summary.standings.map((s) => (
          <li key={s.playerId} className="flex justify-between rounded bg-slate-800 px-3 py-2">
            <span>
              {s.rank}. {s.nickname}
              {s.playerId === session.playerId && " (you)"}
            </span>
            <span className="font-semibold">{s.score}</span>
          </li>
        ))}
      </ol>

      <h2 className="text-xl font-semibold">Cards to revise ({summary.missed.length})</h2>
      {summary.missed.length === 0 && <p>The group got every card. Nice.</p>}
      <ul className="w-full space-y-3">
        {summary.missed.map((c) => (
          <li key={c.id}>
            <article className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-left shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">{c.subject} · {c.topic}</p>
              <h3 className="mt-1 text-lg font-semibold">{c.prompt}</h3>
              {c.latex && <Formula latex={c.latex} />}
              <p className="mt-1 text-sm"><span className="font-medium">Answer:</span> {c.answers[0]}</p>
              <p className="mt-1 text-sm text-slate-300">{c.explanation}</p>
              <FlagButton card={c} />
            </article>
          </li>
        ))}
      </ul>

      <button
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-40"
        disabled={!isHost}
        onClick={startGame}
      >
        Play again
      </button>
      {!isHost && <p className="text-sm text-slate-400">The host can start another game.</p>}
      <button
        className="text-indigo-400 underline"
        onClick={() => {
          leaveRoom();
          location.hash = "#/";
        }}
      >
        Leave room
      </button>
    </main>
  );
}
