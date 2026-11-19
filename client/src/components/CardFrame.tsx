import type { ReactNode } from "react";
import { Formula } from "./Formula";

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
      {latex && <Formula latex={latex} />}
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
