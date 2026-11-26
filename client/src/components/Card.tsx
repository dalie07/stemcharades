import { LEVEL_LABELS, getCourse, type Card as CardData } from "@stemcharades/shared";
import { CardFrame, DontSay } from "./CardFrame";
import { FlagButton } from "./FlagButton";

/** A whole deck card. With `reveal` it also shows the answer, the explanation and the flag button. */
export function Card({ card, reveal = false }: { card: CardData; reveal?: boolean }) {
  const eyebrow = `${LEVEL_LABELS[card.level]} ${getCourse(card.course)?.name ?? card.subject} · ${card.topic} · ${card.type}`;
  return (
    <CardFrame
      eyebrow={card.status === "draft" ? `${eyebrow} · draft` : eyebrow}
      title={card.prompt}
      latex={card.latex}
      subject={card.subject}
    >
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
    <div className="mt-4 border-t-2 border-dashed border-line pt-3">
      {answer && (
        <p className="mb-1 text-lg">
          <span className="font-hand text-xl text-accent">Answer:</span> <strong>{answer}</strong>
        </p>
      )}
      <p className="text-ink-muted">{explanation}</p>
      <FlagButton card={card} />
    </div>
  );
}
