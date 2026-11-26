import { useEffect, useRef, type ReactNode } from "react";
import { Button, Heading } from "./ui";

interface StepProps {
  /** 1-based position and how many steps there are, for the progress dots. */
  step: number;
  total: number;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Shown under the content, above the buttons, e.g. why Next is disabled. */
  hint?: ReactNode;
}

/**
 * One decision per screen. Progress dots on top, the choice in the middle, Back and Next at the bottom of the
 * screen where a thumb can reach them. Focus moves to the new step's heading so screen readers follow along.
 */
export function Step({ step, total, title, sub, children, onBack, onNext, nextLabel = "Next", nextDisabled, hint }: StepProps) {
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => heading.current?.focus(), [step]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-5 pb-4">
      <p className="sr-only">
        Step {step} of {total}
      </p>
      <div aria-hidden="true" className="flex justify-center gap-2">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 rounded-full transition-all ${i + 1 === step ? "w-7 bg-accent" : i + 1 < step ? "w-2.5 bg-ink/70" : "w-2.5 bg-line"}`}
          />
        ))}
      </div>

      <div key={step} className="step-in mt-6 flex flex-1 flex-col items-center gap-5 text-center">
        <div ref={heading} tabIndex={-1} className="outline-none">
          <Heading sub={sub}>{title}</Heading>
        </div>
        {children}
      </div>

      <div className="sticky bottom-0 mt-6 space-y-2 bg-board/90 pt-3 backdrop-blur-sm">
        {hint && <p className="text-center text-sm text-ink-muted">{hint}</p>}
        <div className="flex gap-3">
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              <span className="whitespace-nowrap">← Back</span>
            </Button>
          )}
          {onNext && (
            <Button wide onClick={onNext} disabled={nextDisabled}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
