import { useState, type FormEvent } from "react";
import { MAX_CLUE_LENGTH, MAX_GUESS_LENGTH, type RoomView, type RoundView } from "@stemcharades/shared";
import { CardFrame, DontSay } from "../components/CardFrame";
import { Timer } from "../components/Timer";
import { Button, Notice, Screen, inputClass, mutedClass } from "../components/ui";
import { useCountdown } from "../hooks/useCountdown";
import { useGameStore, type Session } from "../state/gameStore";
import { sendClue, sendGuess, skipRound } from "../state/socket";

/** A live round. The explainer and the guessers get different screens, built from different server views. */
export function Round({ room, session }: { room: RoomView; session: Session }) {
  const round = room.round!;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.nickname;
  const gotIt = round.guessedCorrect.map(nameOf).filter(Boolean).join(", ");
  const secondsLeft = useCountdown(round.endsAt);

  return (
    <Screen>
      <div className="flex w-full items-center justify-between">
        <span className={`text-sm ${mutedClass}`}>
          Round {round.number}/{round.totalRounds}
        </span>
        <Timer seconds={secondsLeft} />
      </div>

      {session.playerId === round.explainerId ? (
        <Explain round={round} />
      ) : (
        <Guess round={round} explainer={nameOf(round.explainerId) ?? "Someone"} hasIt={round.guessedCorrect.includes(session.playerId)} />
      )}

      {gotIt ? (
        <p className="text-green-400" aria-live="polite">
          ✓ Got it: {gotIt}
        </p>
      ) : (
        <p className={mutedClass}>Nobody has it yet.</p>
      )}
    </Screen>
  );
}

/** A one-line text form that clears itself after sending. */
interface SendFormProps {
  label: string;
  placeholder: string;
  button: string;
  maxLength: number;
  onSend: (text: string) => void;
}

function SendForm({ label, placeholder, button, maxLength, onSend }: SendFormProps) {
  const [text, setText] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }
  return (
    <form onSubmit={submit} className="flex w-full gap-2">
      <input
        aria-label={label}
        className={inputClass}
        maxLength={maxLength}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus
      />
      <Button type="submit">{button}</Button>
    </form>
  );
}

function ClueFeed({ round }: { round: RoundView }) {
  return (
    <ol className="w-full space-y-2 text-left" aria-label="Clues so far">
      {round.clues.length === 0 && <li className={mutedClass}>No clues yet.</li>}
      {round.clues.map((clue) => (
        <li key={clue.id} className="rounded bg-slate-800 px-3 py-2">
          {clue.text}
        </li>
      ))}
    </ol>
  );
}

function Explain({ round }: { round: RoundView }) {
  const clueNotice = useGameStore((s) => s.clueNotice);
  const card = round.explainerCard;
  if (!card) return null;

  return (
    <>
      <p className="font-medium text-indigo-300">You're explaining</p>
      <CardFrame as="h1" eyebrow={`${card.subject} · ${card.topic} · ${card.type}`} title={card.prompt} latex={card.latex}>
        <DontSay words={card.forbidden} />
      </CardFrame>
      <SendForm label="Type a clue" placeholder="Type a clue…" button="Send" maxLength={MAX_CLUE_LENGTH} onSend={sendClue} />
      {clueNotice && (
        <Notice tone="error" align="left">
          {clueNotice}
        </Notice>
      )}
      <ClueFeed round={round} />
      <Button variant="secondary" onClick={skipRound}>
        Skip this card
      </Button>
    </>
  );
}

function Guess({ round, explainer, hasIt }: { round: RoundView; explainer: string; hasIt: boolean }) {
  const feedback = useGameStore((s) => s.guessFeedback);

  return (
    <>
      <h1 className="text-2xl font-bold">{explainer} is explaining</h1>
      <p className={mutedClass}>
        A {round.card.type} from {round.card.subject}
      </p>
      <ClueFeed round={round} />
      {hasIt ? (
        <Notice tone="success">You got it! Waiting for the others…</Notice>
      ) : (
        <SendForm label="Type your guess" placeholder="Your guess…" button="Guess" maxLength={MAX_GUESS_LENGTH} onSend={sendGuess} />
      )}
      {!hasIt && feedback && (
        <p role="status" className={feedback.result === "close" ? "text-amber-400" : mutedClass}>
          {feedback.result === "close" ? `"${feedback.guess}" is close! Check your spelling.` : `"${feedback.guess}" isn't it.`}
        </p>
      )}
    </>
  );
}
