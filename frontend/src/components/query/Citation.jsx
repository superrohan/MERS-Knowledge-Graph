export function Citation({ citation, index, onOpenSource }) {
  const api = citation.api;

  return (
    <li className="citation">
      <div>
        <div className="citation__index">{index + 1}. {citation.symbolName ?? citation.filePath}</div>
        <div className="text-faint mono" style={{ fontSize: 12 }}>
          {citation.filePath}:{citation.startLine}-{citation.endLine}
        </div>
        {api && (
          <div className="text-faint" style={{ fontSize: 12, marginTop: 4 }}>
            <span className="badge badge--processing">{api.httpMethod}</span> {api.routePath}
            {" · "}
            {api.authRequired ? `🔒 auth required${api.requiredRoles?.length ? ` (${api.requiredRoles.join(", ")})` : ""}` : "🔓 no auth required"}
          </div>
        )}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenSource(citation)}>
        View source
      </button>
    </li>
  );
}
