import { LEVEL_LABELS, type Card as CardData } from "@stemcharades/shared";
import { CardFrame, DontSay } from "./CardFrame";
import { FlagButton } from "./FlagButton";

/** A whole deck card. With `reveal` it also shows the answer, the explanation and the flag button. */
export function Card({ card, reveal = false }: { card: CardData; reveal?: boolean }) {
  const eyebrow = `${card.subject} · ${card.topic} · ${LEVEL_LABELS[card.level]} · ${card.type}`;
  return (
    <CardFrame eyebrow={card.status === "draft" ? `${eyebrow} · draft` : eyebrow} title={card.prompt} latex={card.latex}>
      <DontSay words={card.forbidden} />
      {reveal && <Answer answer={questionAnswer(card)} explanation={card.explanation} card={card} />}
    </CardFrame>
  );
}

/** A term or formula card is its own answer. Only a question card has a separate one worth printing. */
export function questionAnswer(card: { type: string; answers: string[] }): string | undefined {
  return card.type === "question" ? card.answers[0] : undefined;
}

interface AnswerProps {
  /** Shown as "Answer: …" when the card's title is not already the answer. */
  answer?: string;
  explanation: string;
  card: { id: string; prompt: string; subject: string; topic?: string };
}

/** The teaching part of a card: what it was, why, and a way to report a mistake. */
export function Answer({ answer, explanation, card }: AnswerProps) {
  return (
    <div className="mt-3 border-t border-slate-700 pt-3 text-sm">
      {answer && (
        <p className="mb-1">
          <span className="font-medium">Answer:</span> {answer}
        </p>
      )}
      <p className="text-slate-300">{explanation}</p>
      <FlagButton card={card} />
    </div>
  );
}
