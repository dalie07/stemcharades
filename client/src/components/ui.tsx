import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/** The page shell every screen shares: one centred, phone-width column on the board. */
export function Screen({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-5 px-4 py-6 text-center ${centered ? "justify-center" : ""}`}
    >
      {children}
    </main>
  );
}

/** A heading written in chalk (or marker), with a hand-drawn underline. */
export function Heading({ children, sub, as: Tag = "h1" }: { children: ReactNode; sub?: ReactNode; as?: "h1" | "h2" }) {
  return (
    <div className="space-y-1">
      <Tag className={`font-chalk leading-tight ${Tag === "h1" ? "text-4xl" : "text-3xl"}`}>
        <span className="chalk-underline px-1">{children}</span>
      </Tag>
      {sub && <p className="font-hand text-xl text-ink-muted">{sub}</p>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-[0_3px_0_0_var(--board-deep)]",
  secondary: "border-2 border-ink/70 text-ink",
  success: "bg-good text-board shadow-[0_3px_0_0_var(--board-deep)]",
};

const buttonClass = (variant: Variant, wide: boolean) =>
  `min-h-12 rounded-2xl px-5 py-3 font-hand text-xl transition active:translate-y-0.5 disabled:opacity-40 disabled:active:translate-y-0 ${VARIANTS[variant]} ${wide ? "w-full" : ""}`;

interface ButtonStyle {
  variant?: Variant;
  /** Stretch to the width of the column. */
  wide?: boolean;
}

export function Button({ variant = "primary", wide = false, ...props }: ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={buttonClass(variant, wide)} />;
}

/** A link that looks like a button, for navigation. */
export function ButtonLink({ variant = "primary", wide = false, ...props }: ButtonStyle & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={`${buttonClass(variant, wide)} inline-block text-center`} />;
}

const linkClass = "min-h-11 font-hand text-lg text-accent underline decoration-2 underline-offset-4";

export function TextLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={`${linkClass} inline-flex items-center`} />;
}

/** A button that reads as a link, for secondary actions such as "Leave room". */
export function LinkButton({ danger = false, ...props }: { danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={danger ? "min-h-11 font-hand text-lg text-bad underline decoration-2 underline-offset-4" : linkClass}
    />
  );
}

type Tone = "warning" | "error" | "success" | "info";

const TONES: Record<Tone, string> = {
  warning: "rounded-xl border-2 border-warn bg-surface px-3 py-2 text-sm",
  error: "font-medium text-bad",
  success: "rounded-xl border-2 border-good bg-surface px-3 py-3 font-medium",
  info: "rounded-xl bg-surface px-3 py-2",
};

/** A message to the player. Errors are announced at once; everything else politely. */
export function Notice({ tone, children, align = "center" }: { tone: Tone; children: ReactNode; align?: "center" | "left" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`w-full ${TONES[tone]} ${align === "left" ? "text-left" : ""}`}>
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-lg text-ink placeholder:text-ink-muted";
export const selectClass = "mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-3 text-ink";
export const mutedClass = "text-ink-muted";
/** A raised panel on the board: player lists, clues, summaries. */
export const panelClass = "w-full rounded-2xl bg-surface p-4 text-left";

/** Names and scores, highest first as given. Used on the reveal, the scoreboard and the Party summary. */
export function ScoreList({ label, rows }: { label: string; rows: { key: string; name: ReactNode; score: ReactNode }[] }) {
  return (
    <ol className="w-full space-y-2 text-left" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span>{row.name}</span>
          <span className="font-hand text-xl">{row.score}</span>
        </li>
      ))}
    </ol>
  );
}
