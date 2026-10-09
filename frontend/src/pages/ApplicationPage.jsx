import { Link, useNavigate, useParams } from "react-router-dom";

import { startIndexing } from "../api/jobs.js";
import { ApplicationTabs } from "../components/common/ApplicationTabs.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { StatusBadge } from "../components/common/StatusBadge.jsx";
import { useToast } from "../components/common/ToastProvider.jsx";
import { useApplication, useDeleteApplication } from "../hooks/useApplications.js";
import { useAuthorizations } from "../hooks/useAuthorizations.js";
import { formatDate, formatNumber, repositoryLabel } from "../utils/format.js";

export function ApplicationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: app, isLoading, isError, error, refetch } = useApplication(id);
  const deleteApplication = useDeleteApplication();
  const showToast = useToast();
  // Fetched whenever a user requests to view this application - see
  // api/authorization.js. Backed by dummy data on the server for now
  // (the real AA Authorization Registry isn't reachable yet).
  const authorizationsQuery = useAuthorizations(id);

  if (isLoading) return <LoadingState label="Loading application…" />;
  if (isError) {
    return (
      <ErrorState title="Couldn't load this application" error={error} actionLabel="Retry" onAction={refetch} />
    );
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${app.name}"? This cannot be undone.`)) return;
    await deleteApplication.mutateAsync(app.id);
    showToast(`"${app.name}" deleted`, { type: "success" });
    navigate("/applications");
  }

  async function handleStartAnalysis() {
    await startIndexing(app.id);
    showToast("Analysis started", { type: "success" });
    navigate(`/applications/${app.id}/processing`);
  }

  async function handleReindex() {
    if (!window.confirm("The repository will be checked for changes and the knowledge base will be incrementally updated. Continue?")) {
      return;
    }
    await startIndexing(app.id);
    showToast("Re-index started", { type: "success" });
    navigate(`/applications/${app.id}/processing`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{app.name}</h1>
          <div className="page-header__meta">{app.aaNumber}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <StatusBadge status={app.status} />
          <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <ApplicationTabs applicationId={app.id} disabled={app.status !== "READY"} />

      <div className="card stack-md">
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
          </div>
        ))}
        <div>
          <div className="text-faint">Last indexed</div>
          <div>{formatDate(app.lastIndexedAt)}</div>
        </div>
      </div>

      {authorizationsQuery.data && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <strong>Authorization requirements ({authorizationsQuery.data.aaNumber})</strong>
            {authorizationsQuery.data.source === "dummy" && (
              <span className="badge badge--uncertain" title="Stub data - the real AA Authorization Registry isn't connected yet">
                Stub data
              </span>
            )}
          </div>
          <p className="hint" style={{ marginBottom: 10 }}>
            What this AA is cleared to authorize, for later comparison against what the code actually implements.
            Not yet cross-checked against the graph - see the backend for how that comparison is planned.
          </p>
          <ul className="instructions-list" style={{ margin: 0 }}>
            {authorizationsQuery.data.authorizations.map((auth) => (
              <li key={auth.code}>
                <span className="mono">{auth.requiredRole}</span> — <strong>{auth.name}</strong>: {auth.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(app.status === "PROCESSING" || app.status === "QUEUED") && (
        <EmptyState
          icon="⏳"
          title="Analysis in progress"
          description="This application is currently being indexed."
          action={
            <Link className="btn btn-primary" to={`/applications/${app.id}/processing`}>
              View progress
            </Link>
          }
        />
      )}

      {(app.status === "NEW" || app.status === "FAILED") && (
        <EmptyState
          icon="📭"
          title="Knowledge Base Not Ready"
          description="This application has not been indexed yet. Connect the repository and start analysis to create your knowledge base."
          action={
            <button type="button" className="btn btn-primary" onClick={handleStartAnalysis}>
              Start Analysis
            </button>
          }
        />
      )}

      {app.status === "READY" && (
        <>
          <div className="card">
            <div className="app-card__stats">
              <div>
                <strong>{formatNumber(app.stats.files)}</strong>
                Files
              </div>
              <div>
                <strong>{formatNumber(app.stats.classes)}</strong>
                Classes
              </div>
              <div>
                <strong>{formatNumber(app.stats.functions)}</strong>
                Functions
              </div>
              <div>
                <strong>{formatNumber(app.stats.relationships)}</strong>
                Relationships
              </div>
              <div>
                <strong>{formatNumber(app.stats.chunks)}</strong>
                Code chunks
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <Link className="btn btn-primary" to={`/applications/${app.id}/query`}>
              Query Knowledge Base
            </Link>
            <Link className="btn btn-secondary" to={`/applications/${app.id}/knowledge-base`}>
              Knowledge Base
            </Link>
            <button type="button" className="btn btn-secondary" onClick={handleReindex}>
              Re-index
            </button>
          </div>
        </>
      )}
    </div>
  );
}
