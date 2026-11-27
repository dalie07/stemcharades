import { useState } from "react";
import { install, isIOS, isStandalone, useInstall } from "../lib/install";

const KEY = "stemcharades.installDismissed";
const MONTH = 30 * 24 * 3600 * 1000;

function dismissedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < MONTH;
  } catch {
    return false;
  }
}

/**
 * "Put the game on your home screen". On Android (and desktop Chrome or Edge) a button opens the browser's own
 * install dialog; on iPhone, where Safari has no install prompt, it shows the two taps that do it. Hidden once
 * installed, and for a month after "Not now".
 */
export function InstallPrompt() {
  const { offer, installed } = useInstall();
  const [hidden, setHidden] = useState(dismissedRecently);
  const ios = isIOS();

  if (hidden || installed || isStandalone() || (!offer && !ios)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* not remembered: it simply shows again next time */
    }
    setHidden(true);
  };

  return (
    <section aria-labelledby="install-title" className="deal-in w-full rounded-2xl border-2 border-dashed border-accent px-4 py-3 text-left">
      <h2 id="install-title" className="font-hand text-xl">
        Put STEMCHARADES on your home screen
      </h2>
      {offer ? (
        <p className="text-sm text-ink-muted">It opens like an app, full screen, and Party mode works with no internet.</p>
      ) : (
        <p className="text-sm text-ink-muted">
          In Safari, tap the <strong className="text-ink">Share</strong> button{" "}
          <span aria-hidden="true" className="inline-block rounded border border-line px-1">
            ⬆
          </span>
          , then <strong className="text-ink">Add to Home Screen</strong>.
        </p>
      )}
      <div className="mt-2 flex items-center gap-4">
        {offer && (
          <button type="button" onClick={() => void install()} className="min-h-11 rounded-xl bg-accent px-4 font-hand text-lg text-accent-ink">
            Install
          </button>
        )}
        <button type="button" onClick={dismiss} className="min-h-11 font-hand text-lg text-ink-muted underline underline-offset-4">
          Not now
        </button>
      </div>
    </section>
  );
}
