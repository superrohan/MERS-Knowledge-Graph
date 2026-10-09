import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { cancelJob, startIndexing } from "../api/jobs.js";
import { ProcessingLog } from "../components/processing/ProcessingLog.jsx";
import { ProcessingStats } from "../components/processing/ProcessingStats.jsx";
import { ProcessingTimeline } from "../components/processing/ProcessingTimeline.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { applicationKey, useApplication } from "../hooks/useApplications.js";
import { useProcessingJob } from "../hooks/useProcessingJob.js";

export function ProcessingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: app, isLoading: appLoading, isError, error, refetch } = useApplication(id);

  const jobId = app?.activeJobId;
  const { job, connection } = useProcessingJob(id, jobId);

  if (appLoading) return <LoadingState label="Loading application…" />;
  if (isError) {
    return <ErrorState title="Couldn't load this application" error={error} actionLabel="Retry" onAction={refetch} />;
  }

  if (!jobId && app.status === "READY") {
    return (
      <div className="main-content--center card" style={{ maxWidth: 420, margin: "80px auto", textAlign: "center" }}>
        <h2>Already indexed</h2>
        <p className="text-muted">{app.name} has already been analyzed.</p>
        <Link className="btn btn-primary" to={`/applications/${id}/knowledge-base`}>
          Open Knowledge Base
        </Link>
      </div>
    );
  }

  if (!jobId) {
    return (
      <div className="main-content--center card" style={{ maxWidth: 420, margin: "80px auto", textAlign: "center" }}>
        <h2>No analysis in progress</h2>
        <p className="text-muted">Start analyzing {app.name} to build its knowledge base.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await startIndexing(id);
            queryClient.invalidateQueries({ queryKey: applicationKey(id) });
          }}
        >
          Start Analysis
        </button>
      </div>
    );
  }

  if (!job) return <LoadingState label="Connecting to processing status…" />;

  if (job.status === "FAILED") {
    return (
      <div className="processing-page">
        <div className="card processing-page__result" style={{ maxWidth: 480, margin: "48px auto", textAlign: "center" }}>
          <h1>Knowledge Base Creation Failed</h1>
          <p className="text-muted">We couldn't finish analyzing this repository.</p>
          <div style={{ margin: "20px 0" }}>
            <div className="text-faint">Stage</div>
            <div>{job.message}</div>
          </div>
          <div style={{ margin: "20px 0" }}>
            <div className="text-faint">Error</div>
            <div>{job.error ?? "An unknown error occurred."}</div>
          </div>
          <div className="form-actions" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await startIndexing(id);
                queryClient.invalidateQueries({ queryKey: applicationKey(id) });
              }}
            >
              Retry
            </button>
            <Link className="btn btn-secondary" to={`/applications/${id}`}>
              Back to Application
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === "COMPLETED") {
    return (
      <div className="processing-page">
        <div className="card processing-page__result" style={{ maxWidth: 480, margin: "48px auto", textAlign: "center" }}>
          <h1>Knowledge Base Ready</h1>
          <p style={{ color: "var(--color-success)" }}>✓ Repository analyzed successfully</p>
          <h2>{app.name}</h2>
          <ProcessingStats stats={job.stats} />
          {job.commitHash && (
            <p className="text-faint mono" style={{ marginTop: 16 }}>
              Indexed commit: {job.commitHash.slice(0, 10)}
            </p>
          )}
          <Link className="btn btn-primary" to={`/applications/${id}/query`} style={{ marginTop: 16 }}>
            Start Querying
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="processing-page">
      <div className="card processing-page__result" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <p className="text-muted" role="status" aria-live="polite">
          Building your Knowledge Base
        </p>
        <h1>{app.name}</h1>

        <div className="progress-display" aria-live="polite">
          <div className="progress-display__value">{job.progress}%</div>
          <div className="progress-bar" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar__fill" style={{ width: `${job.progress}%` }} />
          </div>
          <div className="text-muted">{job.message}</div>
          {connection === "polling" && <div className="text-faint">Live updates unavailable — polling for status…</div>}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <ProcessingTimeline status={job.status} />
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "14px auto" }}>
        <ProcessingStats stats={job.stats} />
      </div>

      <div style={{ maxWidth: 560, margin: "14px auto" }}>
        <ProcessingLog logs={job.logs} />
      </div>

      <div style={{ maxWidth: 560, margin: "14px auto", textAlign: "center" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await cancelJob(id, jobId);
          }}
        >
          Cancel indexing
        </button>
      </div>
    </div>
  );
}
