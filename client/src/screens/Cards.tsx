import { useEffect, useState } from "react";
import { SUBJECTS, type Card as CardData } from "@stemcharades/shared";
import { Card } from "./components/Card";

export function CardPreview() {
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>("Maths");
  const [cards, setCards] = useState<CardData[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    fetch(`/api/decks/${subject.toLowerCase()}/cards`)
      .then((r) => (r.ok ? (r.json() as Promise<CardData[]>) : Promise.reject(new Error("bad"))))
      .then(setCards)
      .catch(() => setError(true));
  }, [subject]);

  return (
    <section className="mx-auto max-w-xl space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button
            key={s}
            onClick={() => setSubject(s)}
            className={`rounded-full px-3 py-1 text-sm ${s === subject ? "bg-indigo-600 text-white" : "bg-slate-800"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p role="alert">Could not load cards.</p>}
      <p className="text-sm text-slate-400">{cards.length} cards</p>
      {cards.map((c) => (
        <Card key={c.id} card={c} reveal />
      ))}
    </section>
  );
}
