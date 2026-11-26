import { useEffect } from "react";
import type { RoomView } from "@stemcharades/shared";
import { Answer, questionAnswer } from "../components/Card";
import { CardFrame } from "../components/CardFrame";
import { Dust } from "../components/Dust";
import { Button, Heading, ScoreList, Screen, mutedClass, panelClass } from "../components/ui";
import { cue } from "../lib/feedback";
import type { Session } from "../state/gameStore";
import { startGame } from "../state/socket";
import { LeaveRoom } from "./Lobby";

export const ORDINAL = ["1st", "2nd", "3rd"];
export const place = (rank: number) => ORDINAL[rank - 1] ?? `${rank}th`;

/** The end of a game: standings, the highlights, and the cards nobody guessed as a revision list. */
export function Scoreboard({ room, session }: { room: RoomView; session: Session }) {
  const summary = room.summary!;
  const isHost = room.hostId === session.playerId;
  const winner = summary.standings[0];
  const { fastest, topExplainer } = summary.highlights;

  useEffect(() => cue("reveal"), []);

  return (
    <Screen>
      <div className="relative">
        <Heading sub={winner && winner.score > 0 ? `${winner.nickname} wins!` : undefined}>Final scores</Heading>
        <Dust count={20} />
      </div>
      <ScoreList
        label="Final standings"
        rows={summary.standings.map((s) => ({
          key: s.playerId,
          name: (
            <>
              <span className="mr-2 font-hand text-lg text-accent">{place(s.rank)}</span>
              {s.nickname}
              {s.playerId === session.playerId ? " (you)" : ""}
            </>
          ),
          score: s.score,
        }))}
      />

      {(fastest || topExplainer) && (
        <section className={panelClass} aria-labelledby="highlights">
          <h2 id="highlights" className="font-chalk text-2xl">
            Highlights
          </h2>
          <ul className="mt-2 space-y-2">
            {fastest && (
              <li>
                <strong className="font-hand text-lg text-accent">Fastest guess</strong> {fastest.nickname}, “{fastest.prompt}” in {fastest.seconds} s
              </li>
            )}
            {topExplainer && (
              <li>
                <strong className="font-hand text-lg text-accent">Best explainer</strong> {topExplainer.nickname}, {topExplainer.cards}{" "}
                {topExplainer.cards === 1 ? "card" : "cards"} guessed
              </li>
            )}
          </ul>
        </section>
      )}

      <h2 className="font-chalk text-2xl">Cards to revise ({summary.missed.length})</h2>
      {summary.missed.length === 0 ? (
        <p>The group got every card. Nice.</p>
      ) : (
        <p className={`text-sm ${mutedClass}`}>Saved on this device: they come back when you choose “Revise my misses”.</p>
      )}
      <ul className="w-full space-y-3">
        {summary.missed.map((card) => (
          <li key={card.id}>
            <CardFrame as="h3" eyebrow={`${card.subject} · ${card.topic}`} title={card.prompt} latex={card.latex} subject={card.subject}>
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
