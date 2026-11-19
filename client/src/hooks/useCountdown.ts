import { useEffect, useState } from "react";
import { useGameStore } from "../state/gameStore";

/** Whole seconds left until a server timestamp, corrected for clock skew. */
export function useCountdown(endsAt: number): number {
  const offset = useGameStore((s) => s.clockOffset);
  const calc = () => Math.max(0, Math.ceil((endsAt - (Date.now() + offset)) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const id = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(id);
  }, [endsAt, offset]);
  return left;
}
