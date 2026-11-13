import { useCallback, useEffect, useState } from "react";
import { SUBJECTS, type CustomCard } from "@stemcharades/shared";
import { Card } from "../components/Card";
import { api, refreshMe, signOut, type DeckDetail, type DeckSummary, type HistoryRow, type MissedCard } from "../state/account";
import { useGameStore } from "../state/gameStore";

const btn = "min-h-11 rounded-lg px-4 py-2 font-medium";
const field = "w-full rounded border border-slate-300 px-3 py-3";

export function Account() {
  const me = useGameStore((s) => s.me);
  useEffect(() => {
    void refreshMe();
  }, []);

  if (!me) return <Shell><p role="status">Loading…</p></Shell>;
  if (!me.authEnabled) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-slate-600">Accounts are not switched on for this game. You can still play as a guest.</p>
        <a className="text-indigo-600 underline" href="#/">Back</a>
      </Shell>
    );
  }
  if (!me.user) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-slate-600">Optional. Sign in to keep your game history, a revision list of missed cards, and private decks for your class.</p>
        {me.providers.map((p) => (
          <a key={p.id} className={`${btn} w-full bg-slate-800 text-center text-white`} href={`/api/auth/${p.id}`}>
            Sign in with {p.label}
          </a>
        ))}
        <p className="text-sm text-slate-600">We keep a display name only: no email, no password, no real name.</p>
        <a className="text-indigo-600 underline" href="#/">Back</a>
      </Shell>
    );
  }
  return <Signed name={me.user.displayName} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center">{children}</main>;
}

function Signed({ name }: { name: string }) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [missed, setMissed] = useState<MissedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.history().then((r) => (r.ok ? setHistory(r.data) : setError(r.message)));
    void api.missed().then((r) => (r.ok ? setMissed(r.data) : setError(r.message)));
  }, []);

  return (
    <Shell>
      <h1 className="text-2xl font-bold">Hi, {name}</h1>
      {error && <p role="alert" className="text-red-700">{error}</p>}

      <section className="w-full space-y-2 text-left" aria-labelledby="hist">
        <h2 id="hist" className="text-xl font-semibold">Your games</h2>
        {history?.length === 0 && <p className="text-slate-600">No games yet. Sign in before you play and your online games are saved here.</p>}
        <ul className="space-y-1">
          {history?.map((h, i) => (
            <li key={i} className="flex justify-between rounded bg-slate-100 px-3 py-2">
              <span>{new Date(h.playedAt).toLocaleDateString()} · {h.roomSize} players</span>
              <span className="font-semibold">#{h.rank} · {h.score} pts</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="w-full space-y-3 text-left" aria-labelledby="rev">
        <h2 id="rev" className="text-xl font-semibold">Cards to revise ({missed?.length ?? 0})</h2>
        {missed?.length === 0 && <p className="text-slate-600">Nothing to revise. Cards you miss in online games appear here until you get them.</p>}
        {missed?.map((c) => <Card key={c.id} card={c} reveal />)}
      </section>

      <Decks />

      <button className={`${btn} bg-slate-200`} onClick={() => void signOut().then(() => (location.hash = "#/"))}>Sign out</button>
      <a className="text-indigo-600 underline" href="#/">Back</a>
    </Shell>
  );
}

function Decks() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.decks();
    if (r.ok) setDecks(r.data);
    else setError(r.message);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await api.createDeck(name.trim());
    if (!r.ok) return setError(r.message);
    setName("");
    setOpen(r.data.id);
    await load();
  }

  return (
    <section className="w-full space-y-3 text-left" aria-labelledby="decks">
      <h2 id="decks" className="text-xl font-semibold">Your private decks</h2>
      <p className="text-sm text-slate-600">Write cards for your class or study group. Only you can see them; use one when you host an online room.</p>
      <form onSubmit={create} className="flex gap-2">
        <input aria-label="New deck name" className={field} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name, e.g. Year 10 Physics" />
        <button className={`${btn} bg-indigo-600 text-white disabled:opacity-40`} disabled={!name.trim()} type="submit">Create</button>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <ul className="space-y-2">
        {decks.map((d) => (
          <li key={d.id} className="rounded border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <button className="min-h-11 text-left font-medium underline" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
                {d.name} <span className="font-normal text-slate-600">({d.cards} cards)</span>
              </button>
              <button
                className="min-h-11 text-red-700 underline"
                aria-label={`Delete deck ${d.name}`}
                onClick={async () => {
                  if (!confirm(`Delete the deck "${d.name}" and all its cards?`)) return;
                  await api.deleteDeck(d.id);
                  await load();
                }}
              >
                Delete
              </button>
            </div>
            {open === d.id && <DeckEditor id={d.id} onChange={load} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

const blank = { type: "term" as CustomCard["type"], subject: "Physics" as CustomCard["subject"], topic: "", level: 1 as CustomCard["level"], prompt: "", latex: "", answers: "", forbidden: "", explanation: "" };
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function DeckEditor({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const r = await api.deck(id);
    if (r.ok) setDeck(r.data);
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const card: CustomCard = {
      type: form.type, subject: form.subject, topic: form.topic.trim(), level: form.level, prompt: form.prompt.trim(),
      ...(form.type === "formula" && form.latex.trim() ? { latex: form.latex.trim() } : {}),
      answers: list(form.answers), forbidden: list(form.forbidden), explanation: form.explanation.trim(),
    };
    const r = await api.addCard(id, card);
    if (!r.ok) return setError(`${r.message} (Each card needs 3 to 6 forbidden words and an explanation of at least 20 characters.)`);
    setForm({ ...blank, subject: form.subject, topic: form.topic });
    await reload();
    await onChange();
  }
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mt-3 space-y-3">
      <ul className="space-y-1">
        {deck?.cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded bg-slate-100 px-3 py-2">
            <span>{c.prompt}</span>
            <button className="min-h-11 text-red-700 underline" aria-label={`Remove card ${c.prompt}`} onClick={async () => { await api.deleteCard(id, c.id); await reload(); await onChange(); }}>Remove</button>
          </li>
        ))}
        {deck?.cards.length === 0 && <li className="text-slate-600">No cards yet. Add your first below.</li>}
      </ul>
      <form onSubmit={add} className="space-y-2">
        <h3 className="font-medium">Add a card</h3>
        <div className="flex gap-2">
          <select aria-label="Card type" className={field} value={form.type} onChange={(e) => set("type", e.target.value as CustomCard["type"])}>
            <option value="term">Term</option><option value="formula">Formula</option><option value="question">Question</option>
          </select>
          <select aria-label="Level" className={field} value={form.level} onChange={(e) => set("level", Number(e.target.value) as CustomCard["level"])}>
            <option value={1}>School</option><option value={2}>University</option><option value={3}>Advanced</option>
          </select>
        </div>
        <div className="flex gap-2">
          <select aria-label="Subject" className={field} value={form.subject} onChange={(e) => set("subject", e.target.value as CustomCard["subject"])}>
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input aria-label="Topic" className={field} required minLength={2} maxLength={60} placeholder="Topic" value={form.topic} onChange={(e) => set("topic", e.target.value)} />
        </div>
        <input aria-label="Prompt" className={field} required minLength={2} maxLength={200} placeholder="What the explainer sees" value={form.prompt} onChange={(e) => set("prompt", e.target.value)} />
        {form.type === "formula" && <input aria-label="LaTeX formula" className={field} required placeholder="LaTeX, e.g. E=mc^2" value={form.latex} onChange={(e) => set("latex", e.target.value)} />}
        <input aria-label="Accepted answers" className={field} required placeholder="Accepted answers, separated by commas" value={form.answers} onChange={(e) => set("answers", e.target.value)} />
        <input aria-label="Forbidden words" className={field} required placeholder="3 to 6 forbidden words, separated by commas" value={form.forbidden} onChange={(e) => set("forbidden", e.target.value)} />
        <textarea aria-label="Explanation" className={field} required minLength={20} maxLength={500} rows={3} placeholder="Explanation shown at the reveal (2 or 3 sentences)" value={form.explanation} onChange={(e) => set("explanation", e.target.value)} />
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button className={`${btn} w-full bg-indigo-600 text-white`} type="submit">Add card</button>
      </form>
    </div>
  );
}
