import katex from "katex";
import "katex/dist/katex.min.css";

/** Renders trusted deck LaTeX only. Never pass player input here. */
export function Formula({ latex }: { latex: string }) {
  const html = katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    trust: false,
    strict: "warn",
  });
  return <div className="overflow-x-auto py-2" dangerouslySetInnerHTML={{ __html: html }} />;
}
