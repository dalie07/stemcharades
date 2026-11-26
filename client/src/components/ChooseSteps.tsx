import { useMemo } from "react";
import {
  LEVELS,
  LEVEL_LABELS,
  LEVEL_UNIT,
  coursesAt,
  getCourse,
  tidySelection,
  topicKey,
  type Level,
  type Selection,
} from "@stemcharades/shared";
import type { Counts } from "../state/catalog";
import { useProgress } from "../state/progress";
import { Doodle, Stars, courseColor } from "./Doodle";
import { Tile, TileGrid } from "./Tile";

/** How the players want to choose: everything, a part of the curriculum, or the cards this device missed. */
export type PlayMode = "general" | "choose" | "misses";
export type ChooseStepId = "what" | "level" | "course" | "topic";

/** The steps a mode needs: General and "revise my misses" skip straight past the curriculum. */
export const chooseSteps = (mode: PlayMode): ChooseStepId[] => (mode === "choose" ? ["what", "level", "course", "topic"] : ["what"]);

const toggle = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const cardsLabel = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

const AGES: Record<Level, string> = { 1: "ages 5–11", 2: "ages 11–18", 3: "undergraduate", 4: "postgraduate" };

/** Learned cards per topic and per course on this device, for the stars on the tiles. */
function useLearned() {
  const cards = useProgress((s) => s.cards);
  return useMemo(() => {
    const topics: Record<string, number> = {};
    const courses: Record<string, number> = {};
    for (const r of Object.values(cards)) {
      if (r.last !== "got") continue;
      topics[r.topic] = (topics[r.topic] ?? 0) + 1;
      const course = r.topic.slice(0, r.topic.indexOf("/"));
      courses[course] = (courses[course] ?? 0) + 1;
    }
    return { topics, courses };
  }, [cards]);
}

const starsOf = (learned: number, total: number): 0 | 1 | 2 | 3 =>
  total === 0 || learned === 0 ? 0 : learned >= total ? 3 : learned * 2 >= total ? 2 : 1;

export function WhatChoice({ mode, onMode, total, misses }: { mode: PlayMode; onMode: (m: PlayMode) => void; total: number; misses: number }) {
  return (
    <TileGrid label="What to play" role="radiogroup">
      <Tile kind="radio" label="Everything" sub={`General · ${cardsLabel(total)}`} icon={<Doodle subject="science" />} selected={mode === "general"} onClick={() => onMode("general")} />
      <Tile kind="radio" label="Let me choose" sub="Level, subject, topic" icon={<Doodle subject="Maths" />} color="var(--maths)" selected={mode === "choose"} onClick={() => onMode("choose")} />
      {misses > 0 && (
        <Tile
          kind="radio"
          label="Revise my misses"
          sub={`${cardsLabel(misses)} to get right`}
          icon={<Doodle subject="Biology" />}
          color="var(--biology)"
          selected={mode === "misses"}
          onClick={() => onMode("misses")}
        />
      )}
    </TileGrid>
  );
}

interface PartProps {
  value: Selection;
  onChange: (next: Selection) => void;
  counts: Counts;
}

export function LevelChoice({ value, onChange, counts }: PartProps) {
  return (
    <TileGrid label="Level">
      {LEVELS.filter((l) => (counts.levels[l] ?? 0) > 0 || value.levels.includes(l)).map((l) => (
        <Tile
          key={l}
          label={LEVEL_LABELS[l]}
          sub={`${AGES[l]} · ${cardsLabel(counts.levels[l] ?? 0)}`}
          selected={value.levels.includes(l)}
          onClick={() => onChange(tidySelection({ ...value, levels: toggle(value.levels, l) }))}
        />
      ))}
    </TileGrid>
  );
}

/** What the course step is called: subjects at Primary and Secondary, courses beyond. */
export function courseStepTitle(levels: readonly Level[]): string {
  const units = new Set(levels.map((l) => LEVEL_UNIT[l]));
  return units.size === 2 ? "Pick subjects or courses" : units.has("course") ? "Pick courses" : "Pick subjects";
}

export function CourseChoice({ value, onChange, counts }: PartProps) {
  const learned = useLearned();
  const courses = value.levels.flatMap((l) => coursesAt(l)).filter((c) => (counts.courses[c.id] ?? 0) > 0 || value.courses.includes(c.id));
  const many = value.levels.length > 1;
  return (
    <TileGrid label="Subjects and courses">
      <Tile label="All of them" sub="Every subject at this level" selected={value.courses.length === 0} onClick={() => onChange(tidySelection({ ...value, courses: [], topics: [] }))} />
      {courses.map((c) => {
        const n = counts.courses[c.id] ?? 0;
        const subject = c.subjects.length === 1 ? c.subjects[0]! : "science";
        return (
          <Tile
            key={c.id}
            label={many ? `${LEVEL_LABELS[c.level]} ${c.name}` : c.name}
            sub={cardsLabel(n)}
            color={courseColor(c.subjects)}
            icon={<Doodle subject={subject} />}
            badge={<Stars value={starsOf(learned.courses[c.id] ?? 0, n)} />}
            selected={value.courses.includes(c.id)}
            onClick={() => onChange(tidySelection({ ...value, courses: toggle(value.courses, c.id) }))}
          />
        );
      })}
    </TileGrid>
  );
}

export function TopicChoice({ value, onChange, counts }: PartProps) {
  const learned = useLearned();
  const chosen = value.courses.flatMap((id) => getCourse(id) ?? []);
  return (
    <div className="w-full space-y-5">
      <TileGrid label="All topics">
        <Tile label="All topics" sub="Mix everything chosen" selected={value.topics.length === 0} onClick={() => onChange({ ...value, topics: [] })} />
      </TileGrid>
      {chosen.map((c) => (
        <section key={c.id} className="space-y-2 text-left">
          <h2 className="font-hand text-2xl">{c.name}</h2>
          <TileGrid label={`${c.name} topics`}>
            {c.topics
              .map((t) => topicKey(c.id, t))
              .filter((key) => (counts.topics[key] ?? 0) > 0 || value.topics.includes(key))
              .map((key) => {
                const n = counts.topics[key] ?? 0;
                return (
                  <Tile
                    key={key}
                    label={key.slice(c.id.length + 1)}
                    sub={cardsLabel(n)}
                    color={courseColor(c.subjects)}
                    badge={<Stars value={starsOf(learned.topics[key] ?? 0, n)} />}
                    selected={value.topics.includes(key)}
                    onClick={() => onChange({ ...value, topics: toggle(value.topics, key) })}
                  />
                );
              })}
          </TileGrid>
        </section>
      ))}
    </div>
  );
}

export interface Length {
  roundSeconds: 60 | 90;
  rounds: number;
}

const PRESETS: Record<"party" | "online", { name: string; sub: string; value: Length }[]> = {
  party: [
    { name: "Quick", sub: "Everyone explains once · 60 s", value: { rounds: 1, roundSeconds: 60 } },
    { name: "Standard", sub: "Everyone explains twice · 60 s", value: { rounds: 2, roundSeconds: 60 } },
    { name: "Long", sub: "Three turns each · 90 s", value: { rounds: 3, roundSeconds: 90 } },
  ],
  online: [
    { name: "Quick", sub: "3 rounds · 60 s", value: { rounds: 3, roundSeconds: 60 } },
    { name: "Standard", sub: "5 rounds · 60 s", value: { rounds: 5, roundSeconds: 60 } },
    { name: "Long", sub: "8 rounds · 90 s", value: { rounds: 8, roundSeconds: 90 } },
  ],
};

export const defaultLength = (kind: "party" | "online"): Length => PRESETS[kind][0]!.value;
export const describeLength = (kind: "party" | "online", l: Length) =>
  PRESETS[kind].find((p) => p.value.rounds === l.rounds && p.value.roundSeconds === l.roundSeconds)?.name ??
  `${l.rounds} ${kind === "party" ? (l.rounds === 1 ? "turn each" : "turns each") : l.rounds === 1 ? "round" : "rounds"} · ${l.roundSeconds} s`;

/** Game length as three presets, with exact numbers for those who want them. */
export function LengthChoice({ kind, value, onChange, maxRounds }: { kind: "party" | "online"; value: Length; onChange: (l: Length) => void; maxRounds: number }) {
  return (
    <div className="w-full space-y-4">
      <TileGrid label="Game length" role="radiogroup">
        {PRESETS[kind].map((p) => (
          <Tile
            key={p.name}
            kind="radio"
            label={p.name}
            sub={p.sub}
            selected={p.value.rounds === value.rounds && p.value.roundSeconds === value.roundSeconds}
            onClick={() => onChange(p.value)}
          />
        ))}
      </TileGrid>
      <details className="rounded-2xl bg-surface p-4 text-left">
        <summary className="font-hand text-xl">Set it exactly</summary>
        <div className="mt-3 flex gap-4">
          <label className="flex-1">
            Round length
            <select
              className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-3 text-ink"
              value={value.roundSeconds}
              onChange={(e) => onChange({ ...value, roundSeconds: Number(e.target.value) as 60 | 90 })}
            >
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
            </select>
          </label>
          <label className="flex-1">
            {kind === "party" ? "Turns each" : "Rounds"}
            <select
              className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-3 text-ink"
              value={value.rounds}
              onChange={(e) => onChange({ ...value, rounds: Number(e.target.value) })}
            >
              {Array.from({ length: maxRounds }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </div>
  );
}
