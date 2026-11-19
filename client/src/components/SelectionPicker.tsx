import type { ReactNode } from "react";
import {
  GENERAL,
  LEVELS,
  LEVEL_LABELS,
  LEVEL_UNIT,
  coursesAt,
  describeSelection,
  getCourse,
  selectedTopicKeys,
  tidySelection,
  topicKey,
  type Level,
  type Selection,
} from "@stemcharades/shared";
import type { Counts } from "../state/catalog";
import { mutedClass } from "./ui";

const toggle = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function Chip({ pressed, count, onClick, label }: { pressed: boolean; count?: number; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={count === undefined ? label : `${label}, ${count} ${count === 1 ? "card" : "cards"}`}
      onClick={onClick}
      className={`min-h-11 rounded-full px-4 text-sm disabled:opacity-50 ${pressed ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-100"}`}
    >
      {label}
      {count !== undefined && <span className={pressed ? "ml-1.5 text-indigo-200" : `ml-1.5 ${mutedClass}`}>{count}</span>}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** "Subjects", "Courses" or "Subjects and courses", depending on which levels are chosen. */
function unitLabel(levels: readonly Level[]): string {
  const units = new Set(levels.map((l) => LEVEL_UNIT[l]));
  return units.size === 2 ? "Subjects and courses" : units.has("course") ? "Courses" : "Subjects";
}

/** How many playable cards a selection holds, from per-topic counts. */
export function matchingCount(selection: Selection, counts: Counts): number {
  return selectedTopicKeys(selection).reduce((n, key) => n + (counts.topics[key] ?? 0), 0);
}

interface Props {
  value: Selection;
  onChange: (next: Selection) => void;
  counts: Counts;
  /** When the AI is writing cards every part of the map is offered, even parts with no cards yet. */
  ai: boolean;
  disabled?: boolean;
}

/**
 * Choose what to play, as narrowly as you like: General (everything), then levels, then subjects or courses,
 * then topics. Each step is optional and allows several choices. Shared by Party mode and the online lobby.
 */
export function SelectionPicker({ value, onChange, counts, ai, disabled = false }: Props) {
  const set = (next: Selection) => !disabled && onChange(tidySelection(next));
  // Without the AI, parts of the map with no cards are hidden, unless already chosen (e.g. from a link).
  const offered = (count: number | undefined, chosen: boolean) => ai || chosen || (count ?? 0) > 0;
  const general = !value.levels.length && !value.courses.length && !value.topics.length;
  const matching = matchingCount(value, counts);

  const courses = value.levels.flatMap((l) => coursesAt(l));
  const chosenCourses = value.courses.flatMap((id) => getCourse(id) ?? []);

  return (
    <fieldset disabled={disabled} className="w-full space-y-3 text-left">
      <legend className="font-medium">What to play</legend>

      <Group label="Level">
        <Chip pressed={general} onClick={() => set(GENERAL)} label="General · everything" />
        {LEVELS.filter((l) => offered(counts.levels[l], value.levels.includes(l))).map((l) => (
          <Chip
            key={l}
            pressed={value.levels.includes(l)}
            count={counts.levels[l] ?? 0}
            onClick={() => set({ ...value, levels: toggle(value.levels, l) })}
            label={LEVEL_LABELS[l]}
          />
        ))}
      </Group>

      {courses.length > 0 && (
        <Group label={unitLabel(value.levels)}>
          {courses
            .filter((c) => offered(counts.courses[c.id], value.courses.includes(c.id)))
            .map((c) => (
              <Chip
                key={c.id}
                pressed={value.courses.includes(c.id)}
                count={counts.courses[c.id] ?? 0}
                onClick={() => set({ ...value, courses: toggle(value.courses, c.id) })}
                label={value.levels.length > 1 ? `${LEVEL_LABELS[c.level]} ${c.name}` : c.name}
              />
            ))}
        </Group>
      )}

      {chosenCourses.map((c) => (
        <Group key={c.id} label={`${c.name} topics`}>
          {c.topics
            .map((t) => topicKey(c.id, t))
            .filter((key) => offered(counts.topics[key], value.topics.includes(key)))
            .map((key) => (
              <Chip
                key={key}
                pressed={value.topics.includes(key)}
                count={counts.topics[key] ?? 0}
                onClick={() => set({ ...value, topics: toggle(value.topics, key) })}
                label={key.slice(c.id.length + 1)}
              />
            ))}
        </Group>
      ))}

      <p className={`text-sm ${mutedClass}`} aria-live="polite">
        {describeSelection(value)} · {matching} {matching === 1 ? "card" : "cards"}
        {ai && (matching === 0 ? " · fresh cards are being written for this" : " · the AI adds fresh ones as you play")}
      </p>
    </fieldset>
  );
}
