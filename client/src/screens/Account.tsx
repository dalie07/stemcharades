import { useCallback, useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { LEVEL_LABELS, LEVELS, SUBJECTS, type CustomCard } from "@stemcharades/shared";
import { Card } from "../components/Card";
import {
  Button,
  ButtonLink,
  LinkButton,
  Notice,
  Screen,
  TextLink,
  inputClass,
  mutedClass,
  selectClass,
} from "../components/ui";
import {
  api,
  refreshMe,
  signOut,
  type DeckDetail,
  type DeckSummary,
  type HistoryRow,
  type MissedCard,
} from "../state/account";
import { useGameStore } from "../state/gameStore";

/** Optional accounts: sign in, then see your games, your revision list and your private decks. */
export function Account() {
  const me = useGameStore((s) => s.me);
  useEffect(() => {
    void refreshMe();
  }, []);

  if (!me) {
    return (
      <Screen centered>
        <p role="status">Loading…</p>
      </Screen>
    );
  }
  if (!me.authEnabled) {
    return (
      <Screen centered>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className={mutedClass}>Accounts are not switched on for this game. You can still play as a guest.</p>
        <TextLink href="#/">Back</TextLink>
      </Screen>
    );
  }
  if (!me.user) {
    return (
      <Screen centered>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className={mutedClass}>
          Optional. Sign in to keep your game history, a revision list of the cards you missed, and private decks for
          your class.
        </p>
        {me.providers.map((provider) => (
          <ButtonLink key={provider.id} wide variant="secondary" href={`/api/auth/${provider.id}`}>
            Sign in with {provider.label}
          </ButtonLink>
        ))}
        <p className={`text-sm ${mutedClass}`}>We keep a display name only: no email, no password, no real name.</p>
        <TextLink href="#/">Back</TextLink>
      </Screen>
    );
  }
  return <SignedIn name={me.user.displayName} />;
}

function SignedIn({ name }: { name: string }) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [missed, setMissed] = useState<MissedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.history().then((r) => (r.ok ? setHistory(r.data) : setError(r.message)));
    void api.missed().then((r) => (r.ok ? setMissed(r.data) : setError(r.message)));
  }, []);

  return (
    <Screen>
      <h1 className="text-2xl font-bold">Hi, {name}</h1>
      {error && <Notice tone="error">{error}</Notice>}

      <section className="w-full space-y-2 text-left" aria-labelledby="history">
        <h2 id="history" className="text-xl font-semibold">
          Your games
        </h2>
        {history?.length === 0 && (
          <p className={mutedClass}>No games yet. Sign in before you play and your online games are saved here.</p>
        )}
        <ul className="space-y-1">
          {history?.map((game) => (
            <li key={game.playedAt} className="flex justify-between rounded bg-slate-800 px-3 py-2">
              <span>
                {new Date(game.playedAt).toLocaleDateString()} · {game.roomSize} players
              </span>
              <span className="font-semibold">
                #{game.rank} · {game.score} pts
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="w-full space-y-3 text-left" aria-labelledby="revise">
        <h2 id="revise" className="text-xl font-semibold">
          Cards to revise ({missed?.length ?? 0})
        </h2>
        {missed?.length === 0 && (
          <p className={mutedClass}>Nothing to revise. Cards you miss in online games stay here until you get them.</p>
        )}
        {missed?.map((card) => <Card key={card.id} card={card} reveal />)}
      </section>

      <Decks />

      <Button variant="secondary" onClick={() => void signOut().then(() => (location.hash = "#/"))}>
        Sign out
      </Button>
      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}

function Decks() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api.decks();
    if (r.ok) setDecks(r.data);
    else setError(r.message);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await api.createDeck(name.trim());
    if (!r.ok) return setError(r.message);
    setName("");
    setOpenId(r.data.id);
    await reload();
  }

  async function remove(deck: DeckSummary) {
    if (!confirm(`Delete the deck "${deck.name}" and all its cards?`)) return;
    await api.deleteDeck(deck.id);
    await reload();
  }

  return (
    <section className="w-full space-y-3 text-left" aria-labelledby="decks">
      <h2 id="decks" className="text-xl font-semibold">
        Your private decks
      </h2>
      <p className={`text-sm ${mutedClass}`}>
        Write cards for your class or study group. Only you can see them. Pick one when you host an online room.
      </p>

      <form onSubmit={create} className="flex gap-2">
        <input
          aria-label="New deck name"
          className={inputClass}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Deck name, e.g. Year 10 Physics"
        />
        <Button type="submit" disabled={!name.trim()}>
          Create
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}

      <ul className="space-y-2">
        {decks.map((deck) => (
          <li key={deck.id} className="rounded border border-slate-700 p-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-h-11 text-left font-medium underline"
                aria-expanded={openId === deck.id}
                onClick={() => setOpenId(openId === deck.id ? null : deck.id)}
              >
                {deck.name} <span className={`font-normal ${mutedClass}`}>({deck.cards} cards)</span>
              </button>
              <LinkButton danger aria-label={`Delete deck ${deck.name}`} onClick={() => void remove(deck)}>
                Delete
              </LinkButton>
            </div>
            {openId === deck.id && <DeckEditor deckId={deck.id} onChange={reload} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The add-card form keeps lists as comma-separated text until it is submitted. */
const EMPTY_FORM = {
  type: "term" as CustomCard["type"],
  subject: "Physics" as CustomCard["subject"],
  level: 1 as CustomCard["level"],
  topic: "",
  prompt: "",
  latex: "",
  answers: "",
  forbidden: "",
  explanation: "",
};
type CardForm = typeof EMPTY_FORM;

const splitList = (text: string) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function toCard(form: CardForm): CustomCard {
  return {
    type: form.type,
    subject: form.subject,
    level: form.level,
    topic: form.topic.trim(),
    prompt: form.prompt.trim(),
    ...(form.type === "formula" && form.latex.trim() ? { latex: form.latex.trim() } : {}),
    answers: splitList(form.answers),
    forbidden: splitList(form.forbidden),
    explanation: form.explanation.trim(),
  };
}

type FieldProps = { label: string; value: string; onValue: (value: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>;

/** A labelled text input for the card form. */
function Field({ label, value, onValue, ...rest }: FieldProps) {
  return (
    <input
      aria-label={label}
      className={inputClass}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      required
      {...rest}
    />
  );
}

const ADD_CARD_HINT = "Each card needs 3 to 6 forbidden words and an explanation of at least 20 characters.";

function DeckEditor({ deckId, onChange }: { deckId: string; onChange: () => Promise<void> }) {
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api.deck(deckId);
    if (r.ok) setDeck(r.data);
    await onChange();
  }, [deckId, onChange]);
  useEffect(() => {
    void api.deck(deckId).then((r) => r.ok && setDeck(r.data));
  }, [deckId]);

  const set = <K extends keyof CardForm>(key: K, value: CardForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await api.addCard(deckId, toCard(form));
    if (!r.ok) return setError(`${r.message} ${ADD_CARD_HINT}`);
    // Keep the subject, level and topic: the next card is usually on the same thing.
    setForm({ ...EMPTY_FORM, subject: form.subject, level: form.level, topic: form.topic });
    await reload();
  }

  async function remove(cardId: string) {
    await api.deleteCard(deckId, cardId);
    await reload();
  }

  return (
    <div className="mt-3 space-y-3">
      <ul className="space-y-1">
        {deck?.cards.length === 0 && <li className={mutedClass}>No cards yet. Add your first below.</li>}
        {deck?.cards.map((card) => (
          <li key={card.id} className="flex items-center justify-between rounded bg-slate-800 px-3">
            <span>{card.prompt}</span>
            <LinkButton danger aria-label={`Remove card ${card.prompt}`} onClick={() => void remove(card.id)}>
              Remove
            </LinkButton>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="space-y-2">
        <h3 className="font-medium">Add a card</h3>
        <div className="flex gap-2">
          <select
            aria-label="Card type"
            className={selectClass}
            value={form.type}
            onChange={(e) => set("type", e.target.value as CardForm["type"])}
          >
            <option value="term">Term</option>
            <option value="formula">Formula</option>
            <option value="question">Question</option>
          </select>
          <select
            aria-label="Level"
            className={selectClass}
            value={form.level}
            onChange={(e) => set("level", Number(e.target.value) as CardForm["level"])}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
        <select
          aria-label="Subject"
          className={selectClass}
          value={form.subject}
          onChange={(e) => set("subject", e.target.value as CardForm["subject"])}
        >
          {SUBJECTS.map((subject) => (
            <option key={subject}>{subject}</option>
          ))}
        </select>
        <Field
          label="Topic"
          placeholder="Topic, e.g. Thermodynamics"
          value={form.topic}
          onValue={(v) => set("topic", v)}
          minLength={2}
          maxLength={60}
        />
        <Field
          label="Prompt"
          placeholder="What the explainer sees"
          value={form.prompt}
          onValue={(v) => set("prompt", v)}
          minLength={2}
          maxLength={200}
        />
        {form.type === "formula" && (
          <Field
            label="LaTeX formula"
            placeholder="LaTeX, e.g. E=mc^2"
            value={form.latex}
            onValue={(v) => set("latex", v)}
            maxLength={300}
          />
        )}
        <Field
          label="Accepted answers"
          placeholder="Accepted answers, separated by commas"
          value={form.answers}
          onValue={(v) => set("answers", v)}
        />
        <Field
          label="Forbidden words"
          placeholder="3 to 6 forbidden words, separated by commas"
          value={form.forbidden}
          onValue={(v) => set("forbidden", v)}
        />
        <textarea
          aria-label="Explanation"
          className={inputClass}
          placeholder="Explanation shown at the reveal (2 or 3 sentences)"
          value={form.explanation}
          onChange={(e) => set("explanation", e.target.value)}
          required
          minLength={20}
          maxLength={500}
          rows={3}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" wide>
          Add card
        </Button>
      </form>
    </div>
  );
}
