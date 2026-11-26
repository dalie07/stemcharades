import { useEffect, type ReactNode } from "react";
import { Doodle } from "../components/Doodle";
import { SettingsButton } from "../components/Settings";
import { Notice, Screen, TextLink, mutedClass } from "../components/ui";
import { refreshMe } from "../state/account";
import { useGameStore } from "../state/gameStore";
import { missedIds, streak, today, useProgress } from "../state/progress";

function ModeCard({ href, title, sub, icon, onClick }: { href: string; title: string; sub: string; icon: ReactNode; onClick: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="deal-in flex w-full items-center gap-4 rounded-3xl border-2 border-line bg-surface p-5 text-left shadow-[0_5px_0_0_var(--board-deep)] transition active:translate-y-0.5"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink">{icon}</span>
      <span>
        <span className="block font-chalk text-3xl leading-tight">{title}</span>
        <span className="block text-ink-muted">{sub}</span>
      </span>
    </a>
  );
}

export function Home() {
  const notice = useGameStore((s) => s.notice);
  const me = useGameStore((s) => s.me);
  const progress = useProgress();
  // The notice is shown once: it is cleared as soon as the player moves on.
  const dismiss = () => useGameStore.setState({ notice: null });
  const signInFailed = location.hash.includes("signin=failed");
  const days = streak(progress, today());
  const playedToday = progress.days.at(-1) === today();
  const toRevise = missedIds(progress).length;

  useEffect(() => {
    void refreshMe();
  }, []);

  return (
    <Screen centered>
      <SettingsButton />
      <div className="space-y-2">
        <h1 className="font-chalk text-5xl tracking-wide sm:text-6xl">
          <span className="chalk-underline px-1">STEMCHARADES</span>
        </h1>
        <p className="font-hand text-2xl text-ink-muted">Explain it without saying it.</p>
      </div>

      {days > 0 && (
        <p className="pop rounded-full border-2 border-accent px-4 py-1 font-hand text-xl" role="status">
          {days}-day streak{playedToday ? " · see you tomorrow!" : " · play today to keep it!"}
        </p>
      )}

      <div className="w-full space-y-4">
        <ModeCard href="#/party" onClick={dismiss} title="Party mode" sub="One phone, passed around. Works offline." icon={<Doodle subject="party" className="h-8 w-8" />} />
        <ModeCard href="#/online" onClick={dismiss} title="Online room" sub="Everyone plays on their own phone." icon={<Doodle subject="online" className="h-8 w-8" />} />
      </div>

      {toRevise > 0 && (
        <a href="#/party" onClick={dismiss} className="w-full rounded-2xl border-2 border-dashed border-biology px-4 py-3 text-left">
          <span className="font-hand text-xl">
            {toRevise} {toRevise === 1 ? "card" : "cards"} to revise
          </span>
          <span className={`block text-sm ${mutedClass}`}>Choose “Revise my misses” in Party mode to master them.</span>
        </a>
      )}

      {notice && <Notice tone="warning">{notice}</Notice>}
      {signInFailed && <Notice tone="warning">Sign-in did not work. You can try again, or just play as a guest.</Notice>}

      <nav className="flex flex-wrap justify-center gap-x-5" aria-label="More">
        <TextLink href="#/rules" onClick={dismiss}>
          How to play
        </TextLink>
        <TextLink href="#/cards" onClick={dismiss}>
          Browse cards
        </TextLink>
        <TextLink href="#/privacy" onClick={dismiss}>
          Privacy
        </TextLink>
        {me?.authEnabled && (
          <TextLink href="#/me" onClick={dismiss}>
            {me.user ? `${me.user.displayName}'s account` : "Sign in (optional)"}
          </TextLink>
        )}
      </nav>
    </Screen>
  );
}
