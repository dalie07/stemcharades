import type { Card as CardData } from "@stemcharades/shared";
import { FlagButton } from "./FlagButton";
import { Formula } from "./Formula";

const LEVELS = { 1: "School", 2: "University", 3: "Advanced" } as const;

export function Card({ card, reveal = false }: { card: CardData; reveal?: boolean }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-600">
        {card.subject} · {card.topic} · {LEVELS[card.level]} · {card.type}
        {card.status === "draft" && <span className="ml-2 text-amber-700">draft</span>}
      </p>
      <h2 className="mt-1 text-xl font-semibold">{card.prompt}</h2>
      {card.latex && <Formula latex={card.latex} />}
      <p className="mt-2 text-sm text-red-700">
        <span className="font-medium">Don't say:</span> {card.forbidden.join(", ")}
      </p>
      {reveal && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
          <p>
            <span className="font-medium">Answer:</span> {card.answers[0]}
          </p>
          <p className="mt-1 text-slate-700">{card.explanation}</p>
          <FlagButton card={card} />
        </div>
      )}
    </article>
  );
}
