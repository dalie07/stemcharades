import type { CSSProperties, ReactNode } from "react";

interface TileProps {
  label: string;
  /** A second line, e.g. "ages 5–11" or "42 cards". */
  sub?: ReactNode;
  /** A colour (a CSS colour or var(--token)) for the tile's band and border when chosen. */
  color?: string;
  icon?: ReactNode;
  /** Extra corner content, e.g. mastery stars. */
  badge?: ReactNode;
  selected: boolean;
  onClick: () => void;
  /** Toggle tiles (several may be chosen) are buttons with aria-pressed; single-choice tiles are radios. */
  kind?: "toggle" | "radio";
  disabled?: boolean;
}

/** A big, tappable choice on the board. Used by every step of choosing what to play. */
export function Tile({ label, sub, color = "var(--accent)", icon, badge, selected, onClick, kind = "toggle", disabled }: TileProps) {
  const a11y = kind === "radio" ? { role: "radio", "aria-checked": selected } : { "aria-pressed": selected };
  return (
    <button
      type="button"
      {...a11y}
      disabled={disabled}
      onClick={onClick}
      style={{ "--tile": color } as CSSProperties}
      className={`relative flex min-h-24 w-full flex-col justify-between overflow-hidden rounded-2xl border-2 p-4 pl-5 text-left transition active:scale-[0.98] disabled:opacity-40 ${
        selected ? "border-(--tile) bg-surface-2 shadow-[0_0_0_3px_color-mix(in_srgb,var(--tile)_35%,transparent)]" : "border-line bg-surface"
      }`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-(--tile)" />
      <span className="flex w-full items-start justify-between gap-2">
        <span className="font-hand text-2xl leading-tight">{label}</span>
        {selected ? (
          <span aria-hidden="true" className="pop grid h-8 w-8 shrink-0 place-items-center rounded-full bg-(--tile) text-base font-bold text-board">
            ✓
          </span>
        ) : (
          icon && <span className="text-(--tile)">{icon}</span>
        )}
      </span>
      <span className="mt-2 flex w-full items-end justify-between gap-2 text-sm text-ink-muted">
        <span>{sub}</span>
        {badge}
      </span>
    </button>
  );
}

/** A responsive grid of tiles. */
export function TileGrid({ label, children, role = "group" }: { label: string; children: ReactNode; role?: "group" | "radiogroup" }) {
  return (
    <div role={role} aria-label={label} className="grid w-full grid-cols-2 gap-3">
      {children}
    </div>
  );
}
