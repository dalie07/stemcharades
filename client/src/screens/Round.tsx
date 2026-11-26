import { useEffect, useRef, useState, type FormEvent } from "react";
import { LEVEL_LABELS, MAX_CLUE_LENGTH, MAX_GUESS_LENGTH, type RoomView, type RoundView } from "@stemcharades/shared";
import { CardFrame, DontSay } from "../components/CardFrame";
import { Dust } from "../components/Dust";
import { Timer } from "../components/Timer";
import { Button, Heading, Notice, Screen, inputClass, mutedClass } from "../components/ui";
import { useCountdown } from "../hooks/useCountdown";
import { cue } from "../lib/feedback";
import { useGameStore, type Session } from "../state/gameStore";
import { sendClue, sendGuess, skipRound } from "../state/socket";

/** A live round. The explainer and the guessers get different screens, built from different server views. */
export function Round({ room, session }: { room: RoomView; session: Session }) {
  const round = room.round!;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.nickname;
  const gotIt = round.guessedCorrect.map(nameOf).filter(Boolean).join(", ");
  const secondsLeft = useCountdown(round.endsAt);
  const isExplainer = session.playerId === round.explainerId;

  // The explainer hears a chime each time someone gets it.
  const seen = useRef(round.guessedCorrect.length);
  useEffect(() => {
    if (isExplainer && round.guessedCorrect.length > seen.current) cue("correct");
    seen.current = round.guessedCorrect.length;
  }, [isExplainer, round.guessedCorrect.length]);

  return (
    <Screen>
      <div className="flex w-full items-center justify-between">
        <span className={`font-hand text-xl ${mutedClass}`}>
          Round {round.number}/{round.totalRounds}
        </span>
        <Timer seconds={secondsLeft} total={room.settings.roundSeconds} />
      </div>

      {isExplainer ? (
        <Explain round={round} />
      ) : (
        <Guess round={round} explainer={nameOf(round.explainerId) ?? "Someone"} hasIt={round.guessedCorrect.includes(session.playerId)} />
      )}

      {gotIt ? (
        <p className="font-hand text-xl text-good" aria-live="polite">
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

/** The clues so far, as notes chalked on the board, newest at the bottom. */
function ClueFeed({ round }: { round: RoundView }) {
  return (
    <ol className="w-full space-y-2 text-left" aria-label="Clues so far">
      {round.clues.length === 0 && <li className={`font-hand text-lg ${mutedClass}`}>No clues yet…</li>}
      {round.clues.map((clue) => (
        <li key={clue.id} className="deal-in rounded-xl border-l-4 border-accent bg-surface px-4 py-2 font-hand text-xl">
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
      <p className="font-chalk text-2xl text-accent">You're explaining</p>
      <CardFrame
        as="h1"
        eyebrow={`${LEVEL_LABELS[card.level]} ${card.subject} · ${card.topic} · ${card.type}`}
        title={card.prompt}
        latex={card.latex}
        subject={card.subject}
      >
        <DontSay words={card.forbidden} />
      </CardFrame>
      <SendForm label="Type a clue" placeholder="Type a clue…" button="Send" maxLength={MAX_CLUE_LENGTH} onSend={sendClue} />
      {clueNotice && (
        <div key={clueNotice} className="shake w-full">
          <Notice tone="error" align="left">
            {clueNotice}
          </Notice>
        </div>
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

  // Each guess result gets its own sound; a correct one also gets the success screen below.
  useEffect(() => {
    if (feedback) cue(feedback.result);
  }, [feedback]);

  return (
    <>
      <Heading as="h1" sub={`A ${round.card.type} from ${round.card.subject}`}>
        {explainer} is explaining
      </Heading>
      <ClueFeed round={round} />
      {hasIt ? (
        <div className="pop relative w-full">
          <Notice tone="success">You got it! Waiting for the others…</Notice>
          <Dust />
        </div>
      ) : (
        <SendForm label="Type your guess" placeholder="Your guess…" button="Guess" maxLength={MAX_GUESS_LENGTH} onSend={sendGuess} />
      )}
      {!hasIt && feedback && (
        <p key={`${feedback.guess}-${feedback.result}`} role="status" className={`shake font-hand text-xl ${feedback.result === "close" ? "text-warn" : mutedClass}`}>
          {feedback.result === "close" ? `"${feedback.guess}" is close! Check your spelling.` : `"${feedback.guess}" isn't it.`}
        </p>
      )}
    </>
  );
}
