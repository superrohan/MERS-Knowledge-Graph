import { Link, useNavigate, useParams } from "react-router-dom";

import { startIndexing } from "../api/jobs.js";
import { ApplicationTabs } from "../components/common/ApplicationTabs.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { StatusBadge } from "../components/common/StatusBadge.jsx";
import { useApplication } from "../hooks/useApplications.js";
import { useKnowledgeBaseStats } from "../hooks/useKnowledgeBase.js";
import { formatDate, repositoryLabel } from "../utils/format.js";
import { formatNumber } from "../utils/format.js";

export function KnowledgeBasePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: app, isLoading: appLoading, isError: appError, error: appErrorObj, refetch: refetchApp } = useApplication(id);
  const statsQuery = useKnowledgeBaseStats(id, { enabled: Boolean(app && app.status === "READY") });

  if (appLoading) return <LoadingState label="Loading knowledge base…" />;
  if (appError) {
    return <ErrorState title="Couldn't load this application" error={appErrorObj} actionLabel="Retry" onAction={refetchApp} />;
  }

  if (app.status !== "READY") {
    return (
      <EmptyState
        icon="📭"
        title="Knowledge Base Not Ready"
        description="This application has not been indexed yet. Connect the repository and start analysis to create your knowledge base."
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await startIndexing(id);
              navigate(`/applications/${id}/processing`);
            }}
          >
            Start Analysis
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>{app.name}</h1>
      </div>

      <ApplicationTabs applicationId={app.id} />

      <h2 style={{ fontSize: 16 }}>Knowledge Base</h2>
      <div className="card stack-md">
        <div>
          <div className="text-faint">Status</div>
          <StatusBadge status={app.status} />
        </div>
        {app.repositories.map((repo) => (
          <div key={repo.id} style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div className="text-faint">{app.repositories.length > 1 ? repo.name : "Repository"}</div>
              <div>
                {repositoryLabel(repo.repositoryUrl)}
                {repo.isPrivate && (
                  <span className="text-faint" title="Private repository">
                    {" "}
                    🔒
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-faint">Branch</div>
              <div>{repo.branch}</div>
            </div>
            <div>
              <div className="text-faint">Commit</div>
              <div className="mono">{app.lastIndexedCommits?.[repo.repoKey]?.slice(0, 10) ?? "—"}</div>
            </div>
          </div>
        ))}
        <div>
          <div className="text-faint">Last indexed</div>
          <div>{formatDate(app.lastIndexedAt)}</div>
        </div>
      </div>

      {statsQuery.isLoading && <LoadingState label="Loading statistics…" />}
      {statsQuery.isError && (
        <ErrorState error={statsQuery.error} actionLabel="Retry" onAction={statsQuery.refetch} />
      )}
      {statsQuery.data && (
        <div className="card">
          <div className="app-card__stats" style={{ flexWrap: "wrap", rowGap: 16 }}>
            <div>
              <strong>{formatNumber(statsQuery.data.files)}</strong>
              Files
            </div>
            <div>
              <strong>{formatNumber(statsQuery.data.classes)}</strong>
              Classes
            </div>
            <div>
              <strong>{formatNumber(statsQuery.data.functions)}</strong>
              Functions
            </div>
            <div>
              <strong>{formatNumber(statsQuery.data.relationships)}</strong>
              Relationships
            </div>
            <div>
              <strong>{formatNumber(statsQuery.data.chunks)}</strong>
              Code chunks
            </div>
          </div>
        </div>
      )}

      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <Link className="btn btn-primary" to={`/applications/${id}/query`}>
          Query Knowledge Base
        </Link>
        <Link className="btn btn-secondary" to={`/applications/${id}/knowledge-base/graph`}>
          View Graph
        </Link>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            await startIndexing(id);
            navigate(`/applications/${id}/processing`);
          }}
        >
          Re-index
        </button>
      </div>
    </div>
  );
}
