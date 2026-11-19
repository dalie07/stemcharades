import { useState } from "react";
import { flagIssueUrl, flagText, isAiCard, type FlaggableCard } from "../lib/flag";
import { flagAiCard } from "../state/catalog";

const style = "mt-1 inline-flex min-h-11 items-center rounded text-sm text-slate-400 underline";

/** Report a wrong or unclear card. Opens a prefilled GitHub issue, or copies the details if none is configured. */
export function FlagButton({ card }: { card: FlaggableCard }) {
  if (isAiCard(card)) return <ReportAiCard card={card} />;
  return <FlagLibraryCard card={card} />;
}

/** AI cards are reported straight to the game: two people's reports take a card out at once. */
function ReportAiCard({ card }: { card: FlaggableCard }) {
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");
  if (state === "sent") return <p className="mt-1 text-sm text-slate-400" role="status">Thanks. Reported cards are removed quickly.</p>;
  return (
    <button
      className={style}
      aria-label={`Report AI-written card ${card.prompt} as wrong`}
      onClick={async () => setState((await flagAiCard(card.id)) ? "sent" : "failed")}
    >
      {state === "failed" ? "Couldn't send. Try again" : "⚑ Report a mistake"}
    </button>
  );
}

function FlagLibraryCard({ card }: { card: FlaggableCard }) {
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
