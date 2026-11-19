import { selectClass } from "./ui";

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
