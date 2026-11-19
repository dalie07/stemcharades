/** Seconds left, turning red for the last ten. */
export function Timer({ seconds }: { seconds: number }) {
  return (
    <span className={`text-3xl font-bold tabular-nums ${seconds <= 10 ? "text-red-400" : ""}`} role="timer">
      {seconds}s
    </span>
  );
}
