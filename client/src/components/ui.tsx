import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/** The page shell every screen shares: one centred, phone-width column. */
export function Screen({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <main
      className={`mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center ${centered ? "justify-center" : ""}`}
    >
      {children}
    </main>
  );
}

type Variant = "primary" | "secondary" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white",
  secondary: "bg-slate-700 text-white",
  success: "bg-green-700 text-white",
};

const buttonClass = (variant: Variant, wide: boolean) =>
  `min-h-11 rounded-lg px-4 py-3 font-medium disabled:opacity-40 ${VARIANTS[variant]} ${wide ? "w-full" : ""}`;

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
  return <a {...props} className={`${buttonClass(variant, wide)} text-center`} />;
}

const linkClass = "min-h-11 text-indigo-400 underline";

export function TextLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={`${linkClass} inline-flex items-center`} />;
}

/** A button that reads as a link, for secondary actions such as "Leave room". */
export function LinkButton({ danger = false, ...props }: { danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={danger ? "min-h-11 text-red-400 underline" : linkClass} />;
}

type Tone = "warning" | "error" | "success" | "info";

const TONES: Record<Tone, string> = {
  warning: "rounded bg-amber-900 px-3 py-2 text-sm text-amber-100",
  error: "text-red-400",
  success: "rounded bg-green-900 px-3 py-3 font-medium text-green-100",
  info: "rounded bg-indigo-950 px-3 py-2 text-indigo-100",
};

/** A message to the player. Errors are announced at once; everything else politely. */
export function Notice({ tone, children, align = "center" }: { tone: Tone; children: ReactNode; align?: "center" | "left" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`w-full ${TONES[tone]} ${align === "left" ? "text-left" : ""}`}>
      {children}
    </p>
  );
}

export const inputClass = "w-full rounded border border-slate-600 px-3 py-3";
export const selectClass = "mt-1 w-full rounded border border-slate-600 px-2 py-3";
export const mutedClass = "text-slate-400";

/** Names and scores, highest first as given. Used on the reveal, the scoreboard and the Party summary. */
export function ScoreList({ label, rows }: { label: string; rows: { key: string; name: ReactNode; score: ReactNode }[] }) {
  return (
    <ol className="w-full space-y-1 text-left" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className="flex justify-between rounded bg-slate-800 px-3 py-2">
          <span>{row.name}</span>
          <span className="font-semibold">{row.score}</span>
        </li>
      ))}
    </ol>
  );
}
