import { useEffect, useState } from "react";

type Phase = "checking" | "waking" | "ready";

/** Ask the server if it is awake. Resolves true/false; never throws. */
async function ping(timeoutMs: number): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/healthz", { cache: "no-store", signal: ctl.signal });
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
export function WakeGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [seconds, setSeconds] = useState(0);
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const offlineOk = hash === "#/party";

  useEffect(() => {
    if (offlineOk) return;
    let stopped = false;
    const started = Date.now();
    const clock = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);

    (async () => {
      // A healthy server answers almost instantly: only show the wake screen if it does not.
      if (await ping(1500)) return !stopped && setPhase("ready");
      if (stopped) return;
      setPhase("waking");
      // Keep asking until it answers. Each ask may itself hang while the instance boots.
      while (!stopped) {
        if (await ping(5000)) return !stopped && setPhase("ready");
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();

    return () => {
      stopped = true;
      clearInterval(clock);
    };
    // Deliberately not depending on `phase`: changing it must not restart the loop.
  }, [offlineOk]);

  if (phase === "ready" || offlineOk) return <>{children}</>;
  if (phase === "checking") return null;

  const offline = !navigator.onLine;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold">{offline ? "You're offline" : "Waking the server…"}</h1>
      {offline ? (
        <p className="text-slate-400">Online rooms need a connection. Party mode still works.</p>
      ) : (
        <>
          <p className="text-slate-400">
            The free server naps when nobody is playing. It usually wakes in under a minute.
          </p>
          <div
            className="h-2 w-full overflow-hidden rounded bg-slate-700"
            role="progressbar"
            aria-label="Waking the server"
            aria-valuemin={0}
            aria-valuemax={60}
            aria-valuenow={Math.min(seconds, 60)}
          >
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.min(100, (seconds / 60) * 100)}%` }} />
          </div>
          <p className="tabular-nums text-sm text-slate-400" role="status">{seconds}s</p>
        </>
      )}
      <a className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white" href="#/party">
        Play Party mode meanwhile
      </a>
    </main>
  );
}
