import { Link, useNavigate } from "react-router-dom";

import { startIndexing } from "../../api/jobs.js";
import { StatusBadge } from "../common/StatusBadge.jsx";
import { useToast } from "../common/ToastProvider.jsx";
import { formatDate, formatNumber, repositorySummary } from "../../utils/format.js";

export function ApplicationCard({ application }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const isReady = application.status === "READY";
  const isProcessing = application.status === "PROCESSING" || application.status === "QUEUED";

  async function handleReindex() {
    await startIndexing(application.id);
    showToast(`Re-index started for "${application.name}"`, { type: "success" });
    navigate(`/applications/${application.id}/processing`);
  }

  return (
    <article className="card app-card">
      <div className="app-card__title">
        <h3>{application.name}</h3>
        <StatusBadge status={application.status} />
      </div>

      <div className="app-card__meta stack-sm">
        <div>{application.aaNumber}</div>
        <div>
          GitLab: {repositorySummary(application)}
          {application.repositories.length === 1 && (
            <span className="text-faint"> ({application.repositories[0].branch})</span>
          )}
          {application.repositories.some((r) => r.isPrivate) && (
            <span className="text-faint" title="Includes a private repository">
              {" "}
              🔒
            </span>
          )}
        </div>
      </div>

      <div className="app-card__stats">
        <div>
          <strong>{formatNumber(application.stats.files)}</strong>
          Files
        </div>
        <div>
          <strong>{formatNumber(application.stats.symbols)}</strong>
          Symbols
        </div>
        <div>
          <strong>{formatNumber(application.stats.relationships)}</strong>
          Relationships
        </div>
      </div>

      <div className="text-faint">Last indexed: {formatDate(application.lastIndexedAt)}</div>

      <div className="app-card__actions">
        {isReady && (
          <>
            <Link className="btn btn-primary btn-sm" to={`/applications/${application.id}/knowledge-base`}>
              Open Knowledge Base
            </Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleReindex}>
              Re-index
            </button>
          </>
        )}
        {isProcessing && (
          <Link className="btn btn-primary btn-sm" to={`/applications/${application.id}/processing`}>
            View progress
          </Link>
        )}
        {!isReady && !isProcessing && (
          <Link className="btn btn-primary btn-sm" to={`/applications/${application.id}`}>
            Open
          </Link>
        )}
        <Link className="btn btn-secondary btn-sm" to={`/applications/${application.id}`}>
          Details
        </Link>
      </div>
    </article>
  );
}
