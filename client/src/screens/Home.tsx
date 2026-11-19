import { useEffect } from "react";
import { ButtonLink, Notice, Screen, TextLink, mutedClass } from "../components/ui";
import { refreshMe } from "../state/account";
import { useGameStore } from "../state/gameStore";

export function Home() {
  const notice = useGameStore((s) => s.notice);
  const me = useGameStore((s) => s.me);
  // The notice is shown once: it is cleared as soon as the player moves on.
  const dismiss = () => useGameStore.setState({ notice: null });
  const signInFailed = location.hash.includes("signin=failed");

  useEffect(() => {
    void refreshMe();
  }, []);

  return (
    <Screen centered>
      <h1 className="text-4xl font-bold tracking-tight">STEMCHARADES</h1>
      <p className={mutedClass}>Explain it without saying it.</p>

      <ButtonLink wide href="#/party" onClick={dismiss}>
        Party mode · one phone
      </ButtonLink>
      <ButtonLink wide variant="secondary" href="#/online" onClick={dismiss}>
        Online room · play with friends
      </ButtonLink>

      {notice && <Notice tone="warning">{notice}</Notice>}
      {signInFailed && <Notice tone="warning">Sign-in did not work. You can try again, or just play as a guest.</Notice>}

      <nav className="flex flex-wrap justify-center gap-x-5 text-sm" aria-label="More">
        <TextLink href="#/rules" onClick={dismiss}>
          How to play
        </TextLink>
        <TextLink href="#/cards" onClick={dismiss}>
          Browse cards
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
