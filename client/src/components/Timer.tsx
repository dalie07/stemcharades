import { useEffect, useRef } from "react";
import { cue } from "../lib/feedback";

/**
 * Seconds left as a chalk ring that drains, turning red for the last ten, with a tick in the last five and a
 * buzzer at zero (when sound or vibration is on). `total` is the round's full length.
 */
export function Timer({ seconds, total }: { seconds: number; total: number }) {
  const last = useRef(seconds);
  useEffect(() => {
    if (seconds !== last.current) {
      if (seconds === 0) cue("timeup");
      else if (seconds <= 5) cue("tick");
      last.current = seconds;
    }
  }, [seconds]);

  const r = 26;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(1, seconds / total) : 0;
  const urgent = seconds <= 10;

  return (
    <span role="timer" aria-label={`${seconds} seconds left`} className={`relative grid h-16 w-16 place-items-center ${urgent && seconds > 0 ? "text-bad" : "text-ink"}`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <span className={`font-hand text-xl tabular-nums ${urgent && seconds > 0 ? "animate-pulse" : ""}`}>{seconds}s</span>
    </span>
  );
}
