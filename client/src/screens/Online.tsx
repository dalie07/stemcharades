import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { nicknameSchema } from "@stemcharades/shared";
import { Doodle } from "../components/Doodle";
import { cleanCode, codeProblem } from "../lib/roomCode";
import { Button, Heading, LinkButton, Notice, Screen, TextLink, inputClass, mutedClass } from "../components/ui";
import { useGameStore } from "../state/gameStore";
import { savePresetFromHash } from "../state/preset";
import { createRoom, joinRoom, type ActionResult } from "../state/socket";

type Path = "choose" | "create" | "join";

function nameProblem(name: string): string | null {
  if (!name.trim()) return "Enter your nickname first, so the others know who you are.";
  return nicknameSchema.safeParse(name).success ? null : "Nicknames are 2 to 20 letters or numbers.";
}

function PathCard({ title, sub, icon, onClick }: { title: string; sub: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="deal-in flex w-full items-center gap-4 rounded-3xl border-2 border-line bg-surface p-5 text-left shadow-[0_5px_0_0_var(--board-deep)] transition active:translate-y-0.5"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink">{icon}</span>
      <span>
        <span className="block font-chalk text-3xl leading-tight">{title}</span>
        <span className="block text-ink-muted">{sub}</span>
      </span>
    </button>
  );
}

/** Create a room, or join one with its code: two separate paths, so neither screen is crowded. */
export function Online() {
  const notice = useGameStore((s) => s.notice);
  // An invite link or QR code (#/online?join=ABCDE) goes straight to joining, with the code filled in.
  const invited = cleanCode(new URLSearchParams(location.hash.split("?")[1] ?? "").get("join") ?? "");
  const [path, setPath] = useState<Path>(invited ? "join" : "choose");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState(invited);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) return setError(result.message);
    useGameStore.setState({ notice: null });
    location.hash = "#/room";
  }

  const go = (next: Path) => {
    setError(null);
    setPath(next);
  };

  if (path === "choose") {
    return (
      <Screen centered>
        <Heading sub="Everyone plays on their own phone.">Online room</Heading>
        {notice && <Notice tone="warning">{notice}</Notice>}
        <div className="w-full space-y-4">
          <PathCard title="Create a room" sub="You'll be the host and get a code to share." icon={<Doodle subject="party" />} onClick={() => go("create")} />
          <PathCard title="Join a room" sub="Enter the code from the host's screen." icon={<Doodle subject="online" />} onClick={() => go("join")} />
        </div>
        <TextLink href="#/rules">How does it work?</TextLink>
        <TextLink href="#/">Back</TextLink>
      </Screen>
    );
  }

  const nameField = (
    <label className="w-full text-left font-hand text-xl">
      Your nickname
      <input
        ref={nameInput}
        className={inputClass}
        maxLength={20}
        value={nickname}
        autoComplete="nickname"
        enterKeyHint="go"
        onChange={(e) => setNickname(e.target.value)}
      />
    </label>
  );

  if (path === "create") {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      const problem = nameProblem(nickname);
      if (problem) {
        setError(problem);
        return nameInput.current?.focus();
      }
      // A link like #/online?courses=… carries a choice for the new room's lobby.
      savePresetFromHash(location.hash);
      void run(() => createRoom(nickname.trim()));
    };
    return (
      <Screen centered>
        <Heading sub="You'll get a code and a QR code to share.">Create a room</Heading>
        <form onSubmit={submit} className="w-full space-y-4" noValidate>
          {nameField}
          <Button type="submit" wide disabled={busy}>
            {busy ? "Creating…" : "Create room"}
          </Button>
        </form>
        {error && <Notice tone="error">{error}</Notice>}
        <LinkButton onClick={() => go("choose")}>← Back</LinkButton>
      </Screen>
    );
  }

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    const problem = codeProblem(code);
    if (problem) {
      setError(problem);
      return codeInput.current?.focus();
    }
    const nameIssue = nameProblem(nickname);
    if (nameIssue) {
      setError(nameIssue);
      return nameInput.current?.focus();
    }
    void run(() => joinRoom(code, nickname.trim()));
  };

  return (
    <Screen centered>
      <Heading sub="Ask the host for the code on their screen, or scan their QR code.">Join a room</Heading>
      <form onSubmit={submitJoin} className="w-full space-y-4" noValidate>
        <label className="block w-full text-left font-hand text-xl">
          Room code
          <input
            ref={codeInput}
            className={`${inputClass} text-center font-chalk text-3xl uppercase tracking-[0.3em]`}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(cleanCode(e.target.value));
            }}
          />
        </label>
        {nameField}
        <Button type="submit" wide disabled={busy}>
          {busy ? "Joining…" : "Join room"}
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      <p className={`text-sm ${mutedClass}`}>Room codes use letters and the numbers 2 to 9, never O, 0, I or 1.</p>
      <LinkButton onClick={() => go("choose")}>← Back</LinkButton>
    </Screen>
  );
}
