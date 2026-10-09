import { useEffect, useRef } from "react";

import { useSource } from "../../hooks/useSource.js";
import { ErrorState } from "./ErrorState.jsx";
import { LoadingState } from "./LoadingState.jsx";

/**
 * Modal source-code viewer (spec §27). Identifies file, line numbers,
 * symbol, repository, and commit; highlights the cited line range.
 */
export function SourceViewer({ applicationId, citation, repositoryLabel, commitHash, onClose }) {
  const { data, isLoading, isError, error, refetch } = useSource(applicationId, citation);
  const dialogRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!citation) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal source-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Source: ${citation.filePath}`}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="source-viewer__header">
          <div>
            <div className="mono">{citation.filePath}</div>
            <div className="text-faint" style={{ fontSize: 12 }}>
              {repositoryLabel && <>{repositoryLabel} · </>}
              {commitHash && <>commit {commitHash} · </>}
              {citation.symbolName && <>{citation.symbolName} · </>}
              lines {citation.startLine}-{citation.endLine}
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close source viewer">
            Close
          </button>
        </div>

        {isLoading && <LoadingState label="Loading source…" />}
        {isError && <ErrorState error={error} actionLabel="Retry" onAction={refetch} />}

        {data && (
          <div className="source-viewer__code">
            <table>
              <tbody>
                {data.lines.map((line, i) => {
                  const lineNumber = data.startLine + i;
                  const isHighlighted = lineNumber >= citation.startLine && lineNumber <= citation.endLine;
                  return (
                    <tr key={lineNumber} className={isHighlighted ? "source-line source-line--highlight" : "source-line"}>
                      <td className="source-line__number">{lineNumber}</td>
                      <td className="source-line__code">
                        <pre>{line}</pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
