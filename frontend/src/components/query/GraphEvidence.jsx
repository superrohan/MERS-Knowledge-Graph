import { useState } from "react";

/** "How we found this" (spec §29) - an optional, collapsible evidence
 * path showing the graph traversal behind the answer. */
export function GraphEvidence({ graphPath = [] }) {
  const [expanded, setExpanded] = useState(false);
  if (graphPath.length === 0) return null;

  return (
    <div className="graph-evidence">
      <button type="button" className="btn-link" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {expanded ? "Hide" : "Show"} how we found this
      </button>
      {expanded && (
        <ol className="graph-evidence__path">
          {graphPath.map((hop, i) => (
            <li key={`${hop.source}-${hop.relationship}-${hop.target}-${i}`}>
              <span className="mono">{hop.source}</span>
              <span className="graph-evidence__relationship">{hop.relationship}</span>
              <span className="mono">{hop.target}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
