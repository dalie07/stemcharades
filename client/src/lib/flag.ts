export interface FlaggableCard {
  id: string;
  prompt: string;
  subject: string;
  topic?: string;
}

/** "owner/stemcharades". Set VITE_GITHUB_REPO at build time to enable one-click GitHub issues. */
const REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim();

export function flagText(card: FlaggableCard): { title: string; body: string } {
  return {
    title: `Card ${card.id}: possible mistake`,
    body: [
      `**Card:** ${card.id}`,
      `**Prompt:** ${card.prompt}`,
      `**Subject:** ${card.subject}${card.topic ? ` / ${card.topic}` : ""}`,
      "",
      "**What looks wrong?** (wrong answer, wrong explanation, missing alias, forbidden word too easy...)",
      "",
    ].join("\n"),
  };
}

/** A prefilled "new issue" link, or null when no repository is configured. Sends only the card, never player data. */
export function flagIssueUrl(card: FlaggableCard, repo: string | undefined = REPO): string | null {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const { title, body } = flagText(card);
  const url = new URL(`https://github.com/${repo}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  url.searchParams.set("labels", "card-review");
  return url.toString();
}
