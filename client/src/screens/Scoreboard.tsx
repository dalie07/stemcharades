import type { RoomView } from "@stemcharades/shared";
import { Answer, questionAnswer } from "../components/Card";
import { CardFrame } from "../components/CardFrame";
import { Button, ScoreList, Screen, mutedClass } from "../components/ui";
import type { Session } from "../state/gameStore";
import { startGame } from "../state/socket";
import { LeaveRoom } from "./Lobby";

/** The end of a game: final standings, and the cards nobody guessed as a revision list. */
export function Scoreboard({ room, session }: { room: RoomView; session: Session }) {
  const summary = room.summary!;
  const isHost = room.hostId === session.playerId;

  return (
    <Screen>
      <h1 className="text-3xl font-bold">Final scores</h1>
      <ScoreList
        label="Final standings"
        rows={summary.standings.map((s) => ({
          key: s.playerId,
          name: `${s.rank}. ${s.nickname}${s.playerId === session.playerId ? " (you)" : ""}`,
          score: s.score,
        }))}
      />

      <h2 className="text-xl font-semibold">Cards to revise ({summary.missed.length})</h2>
      {summary.missed.length === 0 && <p>The group got every card. Nice.</p>}
      <ul className="w-full space-y-3">
        {summary.missed.map((card) => (
          <li key={card.id}>
            <CardFrame as="h3" eyebrow={`${card.subject} · ${card.topic}`} title={card.prompt} latex={card.latex} generated={card.generated}>
              <Answer answer={questionAnswer(card)} explanation={card.explanation} card={card} />
            </CardFrame>
          </li>
        ))}
      </ul>

      <Button wide disabled={!isHost} onClick={startGame}>
        Play again
      </Button>
      {!isHost && <p className={`text-sm ${mutedClass}`}>The host can start another game.</p>}
      <LeaveRoom />
    </Screen>
  );
}
