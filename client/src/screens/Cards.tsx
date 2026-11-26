import { useEffect, useState } from "react";
import { SUBJECTS, type Card as CardData } from "@stemcharades/shared";
import { Card } from "../components/Card";
import { Notice, Screen, TextLink, mutedClass } from "../components/ui";

type Subject = (typeof SUBJECTS)[number];

/** Browse a subject's cards with their answers and explanations: a revision view. */
export function Cards() {
  const [subject, setSubject] = useState<Subject>("Maths");
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setCards(null);
    setFailed(false);
    fetch(`/api/decks/${subject.toLowerCase()}/cards`)
      .then((res) => (res.ok ? (res.json() as Promise<CardData[]>) : Promise.reject(new Error(String(res.status)))))
      .then((loaded) => current && setCards(loaded))
      .catch(() => current && setFailed(true));
    return () => {
      current = false; // a slow response for a subject the user has left must not overwrite the new one
    };
  }, [subject]);

  return (
    <Screen>
      <h1 className="font-chalk text-4xl">Cards</h1>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Subject">
        {SUBJECTS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === subject}
            onClick={() => setSubject(s)}
            className={`min-h-11 rounded-full px-4 text-sm ${s === subject ? "bg-accent text-accent-ink" : "bg-surface"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {failed && <Notice tone="error">Could not load the cards.</Notice>}
      {cards && <p className={`text-sm ${mutedClass}`}>{cards.length} cards</p>}
      {cards?.map((card) => <Card key={card.id} card={card} reveal />)}
      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}
