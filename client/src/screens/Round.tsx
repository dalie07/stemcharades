import { useState } from "react";
import { MAX_CLUE_LENGTH, type RoomView, type RoundView } from "@stemcharades/shared";
import { Formula } from "../components/Formula";
import { useCountdown } from "../components/useCountdown";
import { useGameStore, type Session } from "../state/gameStore";
import { sendClue, sendGuess, skipRound } from "../state/socket";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center">{children}</main>
);

function Header({ round }: { round: RoundView }) {
  const left = useCountdown(round.endsAt);
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-sm text-slate-600">
        Round {round.number}/{round.totalRounds}
      </span>
      <span className={`text-3xl font-bold tabular-nums ${left <= 10 ? "text-red-600" : ""}`} role="timer">
        {left}s
      </span>
    </div>
  );
}

function GotIt({ round, room }: { round: RoundView; room: RoomView }) {
  const names = round.guessedCorrect.map((id) => room.players.find((p) => p.id === id)?.nickname).filter(Boolean);
  return names.length ? (
    <p className="text-green-700" aria-live="polite">✓ Got it: {names.join(", ")}</p>
  ) : (
    <p className="text-slate-600">Nobody has it yet.</p>
  );
}

function ClueFeed({ round }: { round: RoundView }) {
  return (
    <ol className="w-full space-y-2 text-left" aria-label="Clues so far">
      {round.clues.length === 0 && <li className="text-slate-600">No clues yet.</li>}
      {round.clues.map((c) => (
        <li key={c.id} className="rounded bg-slate-100 px-3 py-2">{c.text}</li>
      ))}
    </ol>
  );
}

export function Round({ room, session }: { room: RoomView; session: Session }) {
  const round = room.round!;
  const explainer = room.players.find((p) => p.id === round.explainerId);
  return session.playerId === round.explainerId ? (
    <Explain round={round} room={room} />
  ) : (
    <Guess round={round} room={room} session={session} explainerName={explainer?.nickname ?? "Someone"} />
  );
}

function Explain({ round, room }: { round: RoundView; room: RoomView }) {
  const clueNotice = useGameStore((s) => s.clueNotice);
  const [text, setText] = useState("");
  const card = round.explainerCard;
  if (!card) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendClue(t);
    setText("");
  }

  return (
    <Shell>
      <Header round={round} />
      <p className="font-medium text-indigo-700">You're explaining</p>
      <article className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-600">{card.subject} · {card.topic} · {card.type}</p>
        <h1 className="mt-1 text-2xl font-semibold">{card.prompt}</h1>
        {card.latex && <Formula latex={card.latex} />}
        <p className="mt-2 text-sm text-red-700"><span className="font-medium">Don't say:</span> {card.forbidden.join(", ")}</p>
      </article>
      <form onSubmit={submit} className="flex w-full gap-2">
        <input
          aria-label="Type a clue"
          className="w-full rounded border border-slate-300 px-3 py-3"
          maxLength={MAX_CLUE_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a clue…"
          autoFocus
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white" type="submit">Send</button>
      </form>
      {clueNotice && <p role="alert" className="w-full text-left text-red-700">{clueNotice}</p>}
      <GotIt round={round} room={room} />
      <ClueFeed round={round} />
      <button className="rounded-lg bg-slate-200 px-4 py-3" onClick={skipRound}>Skip this card</button>
    </Shell>
  );
}

function Guess({ round, room, session, explainerName }: { round: RoundView; room: RoomView; session: Session; explainerName: string }) {
  const feedback = useGameStore((s) => s.guessFeedback);
  const [text, setText] = useState("");
  const hasIt = round.guessedCorrect.includes(session.playerId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendGuess(t);
    setText("");
  }

  return (
    <Shell>
      <Header round={round} />
      <h1 className="text-2xl font-bold">{explainerName} is explaining</h1>
      <p className="text-slate-600">A {round.card.type} from {round.card.subject}</p>
      <ClueFeed round={round} />
      {hasIt ? (
        <p role="status" className="w-full rounded bg-green-100 px-3 py-3 font-medium text-green-800">
          You got it! Waiting for the others…
        </p>
      ) : (
        <form onSubmit={submit} className="flex w-full gap-2">
          <input
            aria-label="Type your guess"
            className="w-full rounded border border-slate-300 px-3 py-3"
            maxLength={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your guess…"
            autoFocus
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white" type="submit">Guess</button>
        </form>
      )}
      {!hasIt && feedback && (
        <p role="status" className={feedback.result === "close" ? "text-amber-700" : "text-slate-600"}>
          {feedback.result === "close" ? `"${feedback.guess}" is close! Check your spelling.` : `"${feedback.guess}" isn't it.`}
        </p>
      )}
      <GotIt round={round} room={room} />
    </Shell>
  );
}
