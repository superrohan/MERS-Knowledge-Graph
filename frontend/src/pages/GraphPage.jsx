import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApplicationTabs } from "../components/common/ApplicationTabs.jsx";
import { SourceViewer } from "../components/common/SourceViewer.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { GraphFilters } from "../components/graph/GraphFilters.jsx";
import { GraphLegend } from "../components/graph/GraphLegend.jsx";
import { GraphViewer } from "../components/graph/GraphViewer.jsx";
import { useApplication } from "../hooks/useApplications.js";
import { useKnowledgeGraph } from "../hooks/useKnowledgeBase.js";
import { commitSummary, repositorySummary } from "../utils/format.js";

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return debounced;
}

export function GraphPage() {
  const { id } = useParams();
  const { data: app } = useApplication(id);

  const [search, setSearch] = useState("");
  const [nodeTypes, setNodeTypes] = useState([]);
  const [relationshipTypes, setRelationshipTypes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [sourceCitation, setSourceCitation] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = {
    search: debouncedSearch || undefined,
    nodeTypes: nodeTypes.length > 0 ? nodeTypes.join(",") : undefined,
    relationshipTypes: relationshipTypes.length > 0 ? relationshipTypes.join(",") : undefined,
  };

  const { data, isLoading, isError, error, refetch } = useKnowledgeGraph(id, filters);

  const nodes = useMemo(
    () => (data?.nodes ?? []).map((n) => ({ ...n, sourceId: undefined })),
    [data],
  );
  const edges = useMemo(
    () => (data?.edges ?? []).map((e) => ({ ...e, sourceId: e.sourceId, targetId: e.targetId })),
    [data],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const relatedEdges = selectedNode
    ? edges.filter((e) => e.sourceId === selectedNode.id || e.targetId === selectedNode.id)
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Knowledge Graph</h1>
          {app && <div className="page-header__meta">{app.name}</div>}
        </div>
        <Link className="btn btn-secondary btn-sm" to={`/applications/${id}/knowledge-base`}>
          Back to Knowledge Base
        </Link>
      </div>

      <ApplicationTabs applicationId={id} />

      <div className="graph-layout">
        <aside className="card graph-sidebar">
          <GraphFilters
            search={search}
            onSearchChange={setSearch}
            nodeTypes={nodeTypes}
            onNodeTypesChange={setNodeTypes}
            relationshipTypes={relationshipTypes}
            onRelationshipTypesChange={setRelationshipTypes}
          />
          <hr className="graph-sidebar__divider" />
          <GraphLegend />
        </aside>

        <div className="card graph-main">
          {isLoading && <LoadingState label="Loading graph…" />}
          {isError && <ErrorState error={error} actionLabel="Retry" onAction={refetch} />}
          {data && <GraphViewer nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />}
        </div>

        <aside className="card graph-detail">
          {!selectedNode && <p className="text-muted">Select a node to see its details and relationships.</p>}
          {selectedNode && (
            <div className="stack-md">
              <div>
                <div className="text-faint">{selectedNode.kind}</div>
                <h3 style={{ margin: 0 }}>{selectedNode.name}</h3>
                <div className="text-faint mono" style={{ fontSize: 12 }}>
                  {selectedNode.filePath}:{selectedNode.startLine}-{selectedNode.endLine}
                </div>
              </div>

              {selectedNode.api && (
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    <span className="mono">{selectedNode.api.httpMethod}</span> {selectedNode.api.routePath}
                  </div>
                  <div className="text-faint" style={{ fontSize: 12.5 }}>
                    {selectedNode.api.authRequired ? (
                      <>
                        🔒 Requires authentication
                        {selectedNode.api.authMechanism && ` (${selectedNode.api.authMechanism})`}
                        {selectedNode.api.requiredRoles?.length > 0 && (
                          <> · roles: {selectedNode.api.requiredRoles.join(", ")}</>
                        )}
                      </>
                    ) : (
                      "🔓 No authentication required"
                    )}
                  </div>
                  {selectedNode.api.requestParams?.length > 0 && (
                    <div className="text-faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                      Params:{" "}
                      {selectedNode.api.requestParams
                        .map(
                          (p) =>
                            `${p.name} (${p.location}${p.required ? "" : ", optional"}${p.source === "observed" ? ", observed" : ""})`,
                        )
                        .join(", ")}
                    </div>
                  )}
                  {selectedNode.api.middlewareChain?.length > 0 && (
                    <div className="text-faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                      Middleware chain:
                      <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {selectedNode.api.middlewareChain.map((step, i) => (
                          <li key={i}>
                            {step.name}
                            {step.detail && <> — {step.detail}</>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  setSourceCitation({
                    filePath: selectedNode.filePath,
                    startLine: selectedNode.startLine,
                    endLine: selectedNode.endLine,
                    symbolName: selectedNode.qualifiedName,
                  })
                }
              >
                Open source
              </button>

              <div>
                <div className="text-faint" style={{ marginBottom: 6 }}>
                  Relationships ({relatedEdges.length})
                </div>
                <ul className="graph-detail__relationships">
                  {relatedEdges.map((edge) => {
                    const isOutgoing = edge.sourceId === selectedNode.id;
                    const otherNode = nodes.find((n) => n.id === (isOutgoing ? edge.targetId : edge.sourceId));
                    return (
                      <li key={edge.id}>
                        <span className="badge badge--processing">{edge.type}</span>{" "}
                        {isOutgoing ? "→" : "←"} {otherNode?.name ?? "external"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>

      {sourceCitation && (
        <SourceViewer
          applicationId={id}
          citation={sourceCitation}
          repositoryLabel={app ? repositorySummary(app) : undefined}
          commitHash={app ? commitSummary(app) : undefined}
          onClose={() => setSourceCitation(null)}
        />
      )}
    </div>
  );
}
