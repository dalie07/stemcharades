import { useState } from "react";
import { flagIssueUrl, flagText, type FlaggableCard } from "../flag";

const style = "min-h-11 rounded px-3 text-sm text-slate-400 underline";

/** Report a wrong or unclear card. Opens a prefilled GitHub issue, or copies the details if none is configured. */
export function FlagButton({ card }: { card: FlaggableCard }) {
  const [copied, setCopied] = useState(false);
  const url = flagIssueUrl(card);
  const label = `Flag card ${card.prompt} as wrong`;

  if (url) {
    return (
      <a className={style} href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
        ⚑ Flag this card
      </a>
    );
  }
  return (
    <button
      className={style}
      aria-label={label}
      onClick={async () => {
        const { title, body } = flagText(card);
        try {
          await navigator.clipboard.writeText(`${title}\n\n${body}`);
          setCopied(true);
        } catch {
          window.prompt("Copy these card details and send them to the maintainer:", `${title}\n\n${body}`);
        }
      }}
    >
      {copied ? "Copied card details" : "⚑ Flag this card"}
    </button>
  );
}
