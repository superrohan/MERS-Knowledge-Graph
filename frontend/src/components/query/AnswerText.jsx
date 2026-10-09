const CITATION_RE = /([\w./-]+\.\w+):(\d+)(?:-(\d+))?/g;
const CODE_RE = /`([^`]+)`/g;

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `k${keySeq}`;
}

/**
 * Renders inline text, turning `path/to/file.py:31-72`-shaped references
 * into clickable citation chips (spec §28: citations are clickable and
 * open the source viewer at those lines) and `code` spans into <code>.
 */
function renderInline(text, onOpenSource) {
  const nodes = [];
  let lastIndex = 0;
  const combined = new RegExp(`${CITATION_RE.source}|${CODE_RE.source}`, "g");
  let match;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      const [, filePath, startLine, endLine] = match;
      nodes.push(
        <button
          key={nextKey()}
          type="button"
          className="citation-chip"
          onClick={() =>
            onOpenSource({
              filePath,
              startLine: Number(startLine),
              endLine: Number(endLine ?? startLine),
            })
          }
        >
          {filePath}:{startLine}
          {endLine ? `-${endLine}` : ""}
        </button>,
      );
    } else {
      nodes.push(<code key={nextKey()}>{match[4]}</code>);
    }
    lastIndex = combined.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** Minimal, safe (no dangerouslySetInnerHTML) markdown-ish rendering for
 * headings, bullet lists, and paragraphs - enough for both the LLM
 * answer and the deterministic template fallback. */
export function AnswerText({ text, onOpenSource }) {
  const lines = text.split("\n");
  const blocks = [];
  let bulletBuffer = [];

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={nextKey()} className="answer-list">
        {bulletBuffer.map((line) => (
          <li key={nextKey()}>{renderInline(line, onOpenSource)}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("### ")) {
      flushBullets();
      blocks.push(<h4 key={nextKey()}>{renderInline(line.slice(4), onOpenSource)}</h4>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      bulletBuffer.push(line.slice(2));
    } else if (line.trim() === "") {
      flushBullets();
    } else {
      flushBullets();
      blocks.push(<p key={nextKey()}>{renderInline(line, onOpenSource)}</p>);
    }
  }
  flushBullets();

  return <div className="answer-text">{blocks}</div>;
}
