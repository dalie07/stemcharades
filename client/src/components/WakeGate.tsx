import { useEffect, useState, type ReactNode } from "react";
import { ButtonLink, Screen, mutedClass } from "./ui";

type Phase = "checking" | "waking" | "ready";

/** Ask the server if it is awake. Resolves true or false; never throws. */
async function isAwake(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/healthz", { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The free Render service sleeps after 15 quiet minutes and takes about a minute to wake.
 * Instead of a blank page, show progress until /healthz answers. Party mode needs no server,
 * so it is never blocked.
 */
export function WakeGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [seconds, setSeconds] = useState(0);
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const worksOffline = hash === "#/party" || hash === "#/rules";

  useEffect(() => {
    if (worksOffline) return;
    let stopped = false;
    const started = Date.now();
    const clock = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);

    void (async () => {
      // A healthy server answers almost instantly: only show the wake screen if it does not.
      if (await isAwake(1500)) return !stopped && setPhase("ready");
      if (stopped) return;
      setPhase("waking");
      // Keep asking until it answers. Each ask may itself hang while the instance boots.
      while (!stopped) {
        if (await isAwake(5000)) return !stopped && setPhase("ready");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })();

    return () => {
      stopped = true;
      clearInterval(clock);
    };
    // Deliberately not depending on `phase`: changing it must not restart the loop.
  }, [worksOffline]);

  if (phase === "ready" || worksOffline) return <>{children}</>;
  if (phase === "checking") return null;

  const offline = !navigator.onLine;
  return (
    <Screen centered>
      <h1 className="font-chalk text-3xl">{offline ? "You're offline" : "Waking the server…"}</h1>
      {offline ? (
        <p className={mutedClass}>Online rooms need a connection. Party mode still works.</p>
      ) : (
        <>
          <p className={mutedClass}>The free server naps when nobody is playing. It usually wakes in under a minute.</p>
          <div
            className="h-2 w-full overflow-hidden rounded bg-surface-2"
            role="progressbar"
            aria-label="Waking the server"
            aria-valuemin={0}
            aria-valuemax={60}
            aria-valuenow={Math.min(seconds, 60)}
          >
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, (seconds / 60) * 100)}%` }} />
          </div>
          <p className={`text-sm tabular-nums ${mutedClass}`} role="status">
            {seconds}s
          </p>
        </>
      )}
      <ButtonLink href="#/party">Play Party mode meanwhile</ButtonLink>
    </Screen>
  );
}
