import { useState } from "react";

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });
}

export function ProcessingLog({ logs = [] }) {
  const [expanded, setExpanded] = useState(false);

  if (logs.length === 0) return null;

  return (
    <div className="processing-log">
      <button type="button" className="btn-link" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {expanded ? "Hide" : "Show"} processing log ({logs.length})
      </button>
      {expanded && (
        <pre className="processing-log__content">
          {logs.map((entry, i) => `${formatTime(entry.timestamp)}  ${entry.message}`).join("\n")}
        </pre>
      )}
    </div>
  );
}
