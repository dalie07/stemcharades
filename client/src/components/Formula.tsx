import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Render a card's LaTeX. Deck formulas are reviewed content, but private decks are written by users, so
 * KaTeX runs locked down: no trusted commands (links, HTML, includes) and hard limits on size and macro
 * expansion. Its output is KaTeX's own markup, never the raw input.
 */
export function Formula({ latex }: { latex: string }) {
  const html = katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    trust: false,
    strict: "warn",
    maxSize: 10,
    maxExpand: 200,
  });
  return <div className="overflow-x-auto py-2" dangerouslySetInnerHTML={{ __html: html }} />;
}
