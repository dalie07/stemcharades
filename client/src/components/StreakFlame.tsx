import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bestStreak, daysToNextTier, flameTier, lastWeek, streak, today, useProgress, type FlameTier } from "../state/progress";

interface Look {
  name: string;
  outer: string;
  inner: string;
  /** Flame size relative to the badge. */
  scale: number;
  glow: string;
}

/** The flame grows, and its colour heats up, the longer the streak runs. */
const LOOKS: Record<FlameTier, Look> = {
  out: { name: "Not lit yet", outer: "var(--ink-muted)", inner: "transparent", scale: 0.8, glow: "transparent" },
  spark: { name: "Spark", outer: "#ffb347", inner: "#ffe28a", scale: 0.8, glow: "rgb(255 179 71 / 0.35)" },
  flame: { name: "Flame", outer: "#ff8a3d", inner: "#ffd166", scale: 0.92, glow: "rgb(255 138 61 / 0.45)" },
  blaze: { name: "Blaze", outer: "#ef4f2f", inner: "#ffb347", scale: 1, glow: "rgb(239 79 47 / 0.55)" },
  inferno: { name: "Inferno", outer: "#3b9bff", inner: "#e6f4ff", scale: 1.08, glow: "rgb(59 155 255 / 0.6)" },
  legend: { name: "Legend", outer: "#b46cff", inner: "#ffd6ff", scale: 1.15, glow: "rgb(180 108 255 / 0.7)" },
};
const NEXT: Partial<Record<FlameTier, FlameTier>> = { out: "spark", spark: "flame", flame: "blaze", blaze: "inferno", inferno: "legend" };

function Flame({ tier, className = "h-8 w-8" }: { tier: FlameTier; className?: string }) {
  const look = LOOKS[tier];
  const lit = tier !== "out";
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} ${lit ? "flicker" : ""}`}
      style={{ transform: `scale(${look.scale})`, filter: lit ? `drop-shadow(0 0 6px ${look.glow})` : undefined } as CSSProperties}
    >
      <path
        d="M12 2.5c.8 3.2 4.9 5.3 4.9 10.3A4.9 4.9 0 0 1 12 21.5a4.9 4.9 0 0 1-4.9-4.9c0-2.4 1.2-3.9 2.3-5 .2 1.6 1 2.6 2 2.9-.6-3.3.1-7.4.6-12z"
        fill={lit ? look.outer : "none"}
        stroke={lit ? "none" : look.outer}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {lit && <path d="M12 12.2c.4 1.6 2.4 2.6 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1 .5-1.7 1-2.2.2.8.6 1.2 1 1.3-.2-1.3.1-2.6.4-3.7z" fill={look.inner} />}
    </svg>
  );
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The daily streak in the top-left corner: a flame and the number of days in a row played. Tapping it shows the
 * best streak, the last seven days and how far it is to the next flame.
 */
export function StreakFlame() {
  const progress = useProgress();
  const day = today();
  const days = streak(progress, day);
  const tier = flameTier(days);
  const playedToday = progress.days.at(-1) === day;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const toNext = daysToNextTier(days);
  const next = NEXT[tier];
  const label = days > 0 ? `${days}-day streak, ${LOOKS[tier].name}` : "No streak yet";

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`corner-top fixed left-3 z-20 flex h-11 items-center gap-1 rounded-full bg-surface pr-3 pl-1.5 shadow ${days > 0 && !playedToday ? "ring-2 ring-accent/60" : ""}`}
      >
        <span key={days} className="pop">
          <Flame tier={tier} />
        </span>
        <span className="font-hand text-xl tabular-nums">{days}</span>
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="streak-title"
        className="m-auto w-[min(92vw,24rem)] rounded-2xl bg-surface p-5 text-center text-ink backdrop:bg-black/50"
      >
        <Flame tier={tier} className="mx-auto h-20 w-20" />
        <h2 id="streak-title" className="mt-2 font-chalk text-3xl">
          {days > 0 ? `${days}-day streak` : "Light your flame"}
        </h2>
        <p className="font-hand text-xl text-ink-muted">{days > 0 ? LOOKS[tier].name : "Play a game today to start a streak."}</p>

        <ol className="mt-4 flex justify-center gap-2" aria-label="The last seven days">
          {lastWeek(progress, day).map((d) => (
            <li key={d.day} className="flex flex-col items-center gap-1">
              <span
                className={`h-6 w-6 rounded-full border-2 ${d.played ? "border-accent bg-accent" : "border-line"}`}
                aria-label={`${WEEKDAY[new Date(`${d.day}T12:00:00`).getDay()]}: ${d.played ? "played" : "not played"}`}
              />
              <span aria-hidden="true" className="text-xs text-ink-muted">
                {WEEKDAY[new Date(`${d.day}T12:00:00`).getDay()]![0]}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4 space-y-1 text-sm">
          {days > 0 && !playedToday && <p className="font-medium text-accent">Play today to keep your streak!</p>}
          {playedToday && <p className="text-good">You've played today. See you tomorrow!</p>}
          {toNext !== null && next && (
            <p className="text-ink-muted">
              {toNext} more {toNext === 1 ? "day" : "days"} in a row to reach <strong className="text-ink">{LOOKS[next].name}</strong>.
            </p>
          )}
          <p className="text-ink-muted">Best streak: {Math.max(bestStreak(progress), days)} {Math.max(bestStreak(progress), days) === 1 ? "day" : "days"}</p>
          <p className="text-xs text-ink-muted">A day counts when you play a game. Missing a day starts the flame again.</p>
        </div>

        <button type="button" onClick={() => setOpen(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-accent font-hand text-xl text-accent-ink">
          Keep going
        </button>
      </dialog>
    </>
  );
}
