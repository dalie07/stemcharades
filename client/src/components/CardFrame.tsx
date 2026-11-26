import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { SUBJECTS, type Subject } from "@stemcharades/shared";
import { Doodle, SUBJECT_COLOR } from "./Doodle";

// KaTeX and its stylesheet are the biggest part of the app, and most cards have no formula: load them on demand.
// The service worker precaches this chunk too, so formulas still render offline in Party mode.
const Formula = lazy(() => import("./Formula").then((m) => ({ default: m.Formula })));

interface CardFrameProps {
  /** Small line above the title, e.g. "Secondary Physics · Waves · term". */
  eyebrow: string;
  title: string;
  /** Heading level, so each screen keeps a sensible outline. */
  as?: "h1" | "h2" | "h3";
  latex?: string;
  /** Colours the card's band and icon. */
  subject?: string;
  children?: ReactNode;
}

const isSubject = (s: string | undefined): s is Subject => (SUBJECTS as readonly string[]).includes(s ?? "");

/**
 * A playing card: a band and icon in the subject's colour, the title in big readable type. Used wherever a card
 * is shown: to the explainer, at the reveal and in revision lists. It is dealt in with a small flourish.
 */
export function CardFrame({ eyebrow, title, as: Heading = "h2", latex, subject, children }: CardFrameProps) {
  const color = isSubject(subject) ? SUBJECT_COLOR[subject] : "var(--accent)";
  return (
    <article
      style={{ "--card": color } as CSSProperties}
      className="deal-in relative w-full overflow-hidden rounded-3xl border-2 border-line bg-surface text-left shadow-[0_6px_0_0_var(--board-deep)]"
    >
      <div className="flex items-center justify-between gap-3 bg-(--card)/15 px-5 py-3">
        <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{eyebrow}</p>
        {isSubject(subject) && <Doodle subject={subject} className="h-7 w-7 shrink-0 text-(--card)" />}
      </div>
      <div aria-hidden="true" className="h-1 bg-(--card)" />
      <div className="px-5 pt-4 pb-5">
        <Heading className="text-2xl leading-snug font-bold">{title}</Heading>
        {latex && (
          <Suspense fallback={<code className="block overflow-x-auto py-2 text-sm text-ink-muted">{latex}</code>}>
            <Formula latex={latex} />
          </Suspense>
        )}
        {children}
      </div>
    </article>
  );
}

/** The words the explainer may not use, as chalk crossed out on the board. */
export function DontSay({ words }: { words: string[] }) {
  return (
    <div className="mt-4">
      <p className="font-hand text-lg text-bad">Don't say:</p>
      <ul className="mt-1 flex flex-wrap gap-2" aria-label="Forbidden words">
        {words.map((w) => (
          <li key={w} className="rounded-lg border-2 border-bad/60 px-2.5 py-1 text-sm font-bold text-bad line-through decoration-2">
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
