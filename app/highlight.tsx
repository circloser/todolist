import { highlightParts } from "./lib/search";

/** Text with every search word wrapped in <mark>. */
export default function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) {
    return <>{text}</>;
  }
  return (
    <>
      {highlightParts(text, terms).map((part, index) =>
        part.hit ? (
          <mark key={index} className="tb-mark">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  );
}
