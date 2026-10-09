import { AnnotationForm } from "./AnnotationForm.jsx";

const VERIFICATION_BADGES = {
  confirmed: { icon: "✓", label: "Confirmed against code", className: "badge--ready" },
  conflicting: { icon: "⚠", label: "Conflicts with code", className: "badge--failed" },
  no_match: { icon: "⛔", label: "No matching endpoint found in code", className: "badge--failed" },
  unverified: { icon: "❓", label: "Not yet verified against code", className: "badge--uncertain" },
};

function VerificationBadge({ status, notes }) {
  const badge = VERIFICATION_BADGES[status] ?? VERIFICATION_BADGES.unverified;
  return (
    <span className={`badge ${badge.className}`} title={notes || badge.label}>
      {badge.icon} {badge.label}
    </span>
  );
}

export function AnnotationCard({
  annotation,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onVerify,
  isSaving,
  isDeleting,
  isVerifying,
  saveError,
}) {
  if (isEditing) {
    return <AnnotationForm annotation={annotation} onSubmit={onSave} onCancel={onCancelEdit} isSubmitting={isSaving} submitError={saveError} />;
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>{annotation.name}</strong>
            {annotation.httpMethod && <span className="badge badge--new">{annotation.httpMethod}</span>}
            {annotation.authRequired && (
              <span className="badge badge--uncertain" title="Requires authentication">
                🔒 {annotation.authMechanism || "auth required"}
              </span>
            )}
            <VerificationBadge status={annotation.verificationStatus} notes={annotation.verificationNotes} />
          </div>
          {annotation.routePath && <div className="mono text-faint">{annotation.routePath}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onVerify} disabled={isVerifying}>
            {isVerifying ? "Checking…" : "Re-check against code"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      {annotation.verificationNotes && (
        <p className="text-faint" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
          {annotation.verificationNotes}
        </p>
      )}
      {annotation.requiredRoles?.length > 0 && (
        <div className="text-faint" style={{ marginTop: 8 }}>
          Roles: {annotation.requiredRoles.join(", ")}
        </div>
      )}
      {annotation.referencePath && (
        <div className="text-faint mono" style={{ marginTop: 4 }}>
          Implemented in: {annotation.referencePath}
        </div>
      )}
      {annotation.notes && <p style={{ marginTop: 8, marginBottom: 0 }}>{annotation.notes}</p>}
    </div>
  );
}
