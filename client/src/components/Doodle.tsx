import type { Subject } from "@stemcharades/shared";

/** Each subject's colour token, used for tiles, card bands and icons. */
export const SUBJECT_COLOR: Record<Subject, string> = {
  Maths: "var(--maths)",
  Physics: "var(--physics)",
  Chemistry: "var(--chemistry)",
  Biology: "var(--biology)",
  Computing: "var(--computing)",
};

/** The colour for a course: its subject's, or a mix for courses that span several (Primary Science). */
export const courseColor = (subjects: readonly Subject[]) => (subjects.length === 1 ? SUBJECT_COLOR[subjects[0]!] : "var(--chemistry)");

type Drawing = Subject | "science" | "party" | "online";

const PATHS: Record<Drawing, string> = {
  // two speech bubbles: people explaining to each other
  party: "M3.5 5.5 h10 a1.5 1.5 0 0 1 1.5 1.5 v5 a1.5 1.5 0 0 1 -1.5 1.5 h-5 l-3 2.5 v-2.5 h-2 a1.5 1.5 0 0 1 -1.5 -1.5 v-5 a1.5 1.5 0 0 1 1.5 -1.5 M17.5 9.5 h2 a1.5 1.5 0 0 1 1.5 1.5 v4.5 a1.5 1.5 0 0 1 -1.5 1.5 h-1 v2.5 l-3 -2.5 h-3.5",
  // a signal: phones talking over the internet
  online: "M12 19.5 m-1.2 0 a1.2 1.2 0 1 0 2.4 0 a1.2 1.2 0 1 0 -2.4 0 M8.2 15.6 a5.4 5.4 0 0 1 7.6 0 M5.3 12.6 a9.4 9.4 0 0 1 13.4 0 M2.5 9.6 a13.4 13.4 0 0 1 19 0",
  // π
  Maths: "M5 8 Q12 6.5 19 8 M9 8 Q9.5 14 7.5 18 M15 8 Q14.5 13 16.5 17.5",
  // an atom: nucleus and two orbits
  Physics: "M12 12 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0 M3.5 12 C3.5 8 20.5 8 20.5 12 C20.5 16 3.5 16 3.5 12 M7.8 4.6 C11 2.6 19.5 17.4 16.2 19.4 C13 21.4 4.6 6.6 7.8 4.6",
  // a conical flask
  Chemistry: "M9.5 3.5 L14.5 3.5 M10.5 3.5 L10.5 9.5 L5 19 Q4.5 20.5 6.2 20.5 L17.8 20.5 Q19.5 20.5 19 19 L13.5 9.5 L13.5 3.5 M7.5 15 L16.5 15",
  // a leaf
  Biology: "M5 19 C5 9 11 4.5 19.5 4.5 C19.5 13 15 19 5 19 M5 19 L14 10",
  // </>
  Computing: "M8.5 7 L3.5 12 L8.5 17 M15.5 7 L20.5 12 L15.5 17 M13.5 5 L10.5 19",
  // a magnifying glass, for mixed science
  science: "M10.5 10.5 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M15 15 L20.5 20.5",
};

/** A chalk-drawn icon for a subject, in the current text colour. Decorative: hidden from screen readers. */
export function Doodle({ subject, className = "h-8 w-8" }: { subject: Drawing; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[subject]} />
    </svg>
  );
}

/** Up to three stars of mastery, drawn in chalk. */
export function Stars({ value }: { value: 0 | 1 | 2 | 3 }) {
  return (
    <span className="font-hand text-lg tracking-widest text-accent" aria-label={`${value} of 3 stars`} title="Mastery: cards you have learned in this topic">
      {"★".repeat(value)}
      <span className="opacity-35">{"☆".repeat(3 - value)}</span>
    </span>
  );
}
