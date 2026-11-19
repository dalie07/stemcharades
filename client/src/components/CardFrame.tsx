import { lazy, Suspense, type ReactNode } from "react";

// KaTeX and its stylesheet are the biggest part of the app, and most cards have no formula: load them on demand.
// The service worker precaches this chunk too, so formulas still render offline in Party mode.
const Formula = lazy(() => import("./Formula").then((m) => ({ default: m.Formula })));

interface CardFrameProps {
  /** Small line above the title, e.g. "Physics · Energy · term". */
  eyebrow: string;
  title: string;
  /** Heading level, so each screen keeps a sensible outline. */
  as?: "h1" | "h2" | "h3";
  latex?: string;
  children?: ReactNode;
}

/** The card panel used wherever a card is shown: to the explainer, at the reveal and in revision lists. */
export function CardFrame({ eyebrow, title, as: Heading = "h2", latex, children }: CardFrameProps) {
  return (
    <article className="w-full rounded-xl border border-slate-700 bg-slate-800 p-4 text-left shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{eyebrow}</p>
      <Heading className="mt-1 text-xl font-semibold">{title}</Heading>
      {latex && (
        <Suspense fallback={<code className="block overflow-x-auto py-2 text-sm text-slate-300">{latex}</code>}>
          <Formula latex={latex} />
        </Suspense>
      )}
      {children}
    </article>
  );
}

/** The words the explainer may not use. */
export function DontSay({ words }: { words: string[] }) {
  return (
    <p className="mt-2 text-sm text-red-400">
      <span className="font-medium">Don't say:</span> {words.join(", ")}
    </p>
  );
}
