import { LEVEL_LABELS, LEVELS, SUBJECTS, type Card, type Level } from "@stemcharades/shared";
import { selectClass } from "./ui";

type Subject = Card["subject"];

const toggle = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

const checkboxLabel = "flex min-h-11 items-center gap-2";

interface DeckFilterProps {
  subjects: readonly Subject[];
  levels: readonly Level[];
  onSubjects: (next: Subject[]) => void;
  onLevels: (next: Level[]) => void;
}

/** Which built-in cards to draw from. Shared by Party mode and the online lobby. */
export function DeckFilterFields({ subjects, levels, onSubjects, onLevels }: DeckFilterProps) {
  return (
    <>
      <fieldset className="w-full text-left">
        <legend className="font-medium">Subjects</legend>
        <div className="flex flex-wrap gap-x-4">
          {SUBJECTS.map((subject) => (
            <label key={subject} className={checkboxLabel}>
              <input
                type="checkbox"
                checked={subjects.includes(subject)}
                onChange={() => onSubjects(toggle(subjects, subject))}
              />
              {subject}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="w-full text-left">
        <legend className="font-medium">Difficulty</legend>
        <div className="flex flex-wrap gap-x-4">
          {LEVELS.map((level) => (
            <label key={level} className={checkboxLabel}>
              <input type="checkbox" checked={levels.includes(level)} onChange={() => onLevels(toggle(levels, level))} />
              {LEVEL_LABELS[level]}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

interface RoundProps {
  roundSeconds: 60 | 90;
  rounds: number;
  maxRounds: number;
  onRoundSeconds: (next: 60 | 90) => void;
  onRounds: (next: number) => void;
}

/** How long a round lasts and how many there are. */
export function RoundFields({ roundSeconds, rounds, maxRounds, onRoundSeconds, onRounds }: RoundProps) {
  return (
    <div className="flex w-full gap-4 text-left">
      <label className="flex-1">
        Round length
        <select
          className={selectClass}
          value={roundSeconds}
          onChange={(e) => onRoundSeconds(Number(e.target.value) as 60 | 90)}
        >
          <option value={60}>60 seconds</option>
          <option value={90}>90 seconds</option>
        </select>
      </label>
      <label className="flex-1">
        Rounds
        <select className={selectClass} value={rounds} onChange={(e) => onRounds(Number(e.target.value))}>
          {Array.from({ length: maxRounds }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
