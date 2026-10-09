import { Link } from "react-router-dom";

import { ApplicationCard } from "../components/applications/ApplicationCard.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { useApplications } from "../hooks/useApplications.js";

export function ApplicationsPage() {
  const { data: applications, isLoading, isError, error, refetch } = useApplications();

  return (
    <div>
      <div className="page-header">
        <h1>Applications</h1>
        <Link to="/applications/new" className="btn btn-primary">
          + Create Application
        </Link>
      </div>

      {isLoading && <LoadingState label="Loading applications…" />}

      {isError && (
        <ErrorState
          title="Couldn't load applications"
          error={error}
          actionLabel="Retry"
          onAction={refetch}
        />
      )}

      {!isLoading && !isError && applications?.length === 0 && (
        <EmptyState
          icon="📁"
          title="No applications yet"
          description="Create your first application to connect a GitLab repository and build its knowledge base."
          action={
            <Link to="/applications/new" className="btn btn-primary">
              + Create Application
            </Link>
          }
        />
      )}

      {!isLoading && !isError && applications?.length > 0 && (
        <div className="app-grid">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}
    </div>
  );
}
