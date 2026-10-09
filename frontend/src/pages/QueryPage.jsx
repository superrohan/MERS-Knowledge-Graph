import { useState } from "react";
import { useParams } from "react-router-dom";

import { getQueryHistoryItem } from "../api/queries.js";
import { ApplicationTabs } from "../components/common/ApplicationTabs.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { SourceViewer } from "../components/common/SourceViewer.jsx";
import { AnswerView } from "../components/query/AnswerView.jsx";
import { QueryHistoryList } from "../components/query/QueryHistoryList.jsx";
import { QueryLoadingState } from "../components/query/QueryLoadingState.jsx";
import { QuerySuggestions } from "../components/query/QuerySuggestions.jsx";
import { useApplication } from "../hooks/useApplications.js";
import { useQueryHistory, useSubmitQuery } from "../hooks/useQueries.js";
import { commitSummary, repositorySummary } from "../utils/format.js";

export function QueryPage() {
  const { id } = useParams();
  const { data: app, isLoading: appLoading } = useApplication(id);
  const [input, setInput] = useState("");
  const [activeResult, setActiveResult] = useState(null);
  const [activeQueryId, setActiveQueryId] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [sourceCitation, setSourceCitation] = useState(null);

  const submitQuery = useSubmitQuery(id);
  const historyQuery = useQueryHistory(id);

  async function handleAsk(text) {
    const question = text.trim();
    if (!question) return;
    setInput(question);
    try {
      const result = await submitQuery.mutateAsync(question);
      setActiveResult(result);
      setActiveQueryId(result.queryId);
    } catch {
      // surfaced via submitQuery.isError below
    }
  }

  async function handleSelectHistory(queryId) {
    setHistoryError(null);
    setActiveQueryId(queryId);
    try {
      const item = await getQueryHistoryItem(id, queryId);
      setActiveResult(item);
    } catch (err) {
      setHistoryError(err);
    }
  }

  if (appLoading) return <LoadingState label="Loading…" />;

  if (app.status !== "READY") {
    return (
      <EmptyState
        icon="📭"
        title="Knowledge Base Not Ready"
        description="This application has not been indexed yet. Query is available once analysis completes."
      />
    );
  }

  return (
    <div className="query-page">
      <div className="page-header">
        <div>
          <h1>{app.name}</h1>
          <div className="page-header__meta">{repositorySummary(app)}</div>
        </div>
        <span className="badge badge--ready">Knowledge Base ●</span>
      </div>

      <ApplicationTabs applicationId={id} />

      <div className="query-layout">
        <div className="query-main card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(input);
            }}
          >
            <label htmlFor="query-input" className="text-faint" style={{ display: "block", marginBottom: 8 }}>
              Ask anything about this codebase
            </label>
            <div className="query-input-row">
              <input
                id="query-input"
                className="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="How does authentication work in this application?"
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary" disabled={submitQuery.isPending || !input.trim()}>
                Ask →
              </button>
            </div>
          </form>

          {!activeResult && !submitQuery.isPending && (
            <div style={{ marginTop: 20 }}>
              <QuerySuggestions onSelect={handleAsk} />
            </div>
          )}

          {submitQuery.isPending && (
            <div style={{ marginTop: 24 }}>
              <QueryLoadingState />
            </div>
          )}

          {submitQuery.isError && (
            <div style={{ marginTop: 20 }}>
              <ErrorState
                title="Couldn't answer that question"
                error={submitQuery.error}
                actionLabel="Try again"
                onAction={() => handleAsk(input)}
              />
            </div>
          )}

          {historyError && (
            <div style={{ marginTop: 20 }}>
              <ErrorState title="Couldn't load that answer" error={historyError} />
            </div>
          )}

          {activeResult && !submitQuery.isPending && (
            <div style={{ marginTop: 24 }}>
              <AnswerView result={activeResult} onOpenSource={setSourceCitation} />
            </div>
          )}
        </div>

        <aside className="card query-history-panel">
          <h3 style={{ fontSize: 14 }}>Recent questions</h3>
          {historyQuery.isLoading && <LoadingState label="Loading history…" />}
          {historyQuery.data && (
            <QueryHistoryList history={historyQuery.data} activeQueryId={activeQueryId} onSelect={handleSelectHistory} />
          )}
        </aside>
      </div>

      {sourceCitation && (
        <SourceViewer
          applicationId={id}
          citation={sourceCitation}
          repositoryLabel={repositorySummary(app)}
          commitHash={commitSummary(app)}
          onClose={() => setSourceCitation(null)}
        />
      )}
    </div>
  );
}
