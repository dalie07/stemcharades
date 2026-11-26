import type { CSSProperties } from "react";

/**
 * A puff of chalk dust: particles burst from the centre of the parent (which must be `relative`). Re-mount it
 * with a new `key` to play it again. Hidden entirely for people who prefer reduced motion.
 */
export function Dust({ count = 14 }: { count?: number }) {
  return (
    <span className="dust" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const distance = 50 + ((i * 37) % 40);
        const style = {
          "--dx": `${Math.round(Math.cos(angle) * distance)}px`,
          "--dy": `${Math.round(Math.sin(angle) * distance)}px`,
          animationDelay: `${(i % 4) * 30}ms`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}
