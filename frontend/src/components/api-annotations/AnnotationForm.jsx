import { useState } from "react";

const HTTP_METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function toFormValues(annotation) {
  return {
    name: annotation?.name ?? "",
    httpMethod: annotation?.httpMethod ?? "",
    routePath: annotation?.routePath ?? "",
    authRequired: annotation?.authRequired ?? false,
    authMechanism: annotation?.authMechanism ?? "",
    requiredRoles: (annotation?.requiredRoles ?? []).join(", "),
    notes: annotation?.notes ?? "",
    referencePath: annotation?.referencePath ?? "",
  };
}

/** Add/edit form for a user-declared API endpoint. Everything but the
 * name is optional - a user may only know the route, or only want to
 * flag that an endpoint requires auth, without filling in every field. */
export function AnnotationForm({ annotation, onSubmit, onCancel, isSubmitting, submitError }) {
  const [values, setValues] = useState(() => toFormValues(annotation));
  const [nameTouched, setNameTouched] = useState(false);

  const nameError = !values.name.trim() ? "Endpoint name is required." : null;

  function update(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setNameTouched(true);
    if (nameError) return;

    onSubmit({
      name: values.name.trim(),
      httpMethod: values.httpMethod || undefined,
      routePath: values.routePath.trim() || undefined,
      authRequired: values.authRequired,
      authMechanism: values.authMechanism.trim() || undefined,
      requiredRoles: values.requiredRoles
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
      notes: values.notes.trim() || undefined,
      referencePath: values.referencePath.trim() || undefined,
    });
  }

  return (
    <form className="card stack-md" onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="form-field" style={{ flex: 2, minWidth: 220 }}>
          <label htmlFor="annotation-name">Endpoint name</label>
          <input
            id="annotation-name"
            className={`input${nameTouched && nameError ? " has-error" : ""}`}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            onBlur={() => setNameTouched(true)}
            placeholder="Refund Payment"
            autoComplete="off"
          />
          {nameTouched && nameError && (
            <p className="field-error" role="alert">
              {nameError}
            </p>
          )}
        </div>

        <div className="form-field" style={{ width: 120 }}>
          <label htmlFor="annotation-method">Method</label>
          <select id="annotation-method" className="select" value={values.httpMethod} onChange={(e) => update("httpMethod", e.target.value)}>
            {HTTP_METHODS.map((method) => (
              <option key={method || "none"} value={method}>
                {method || "—"}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field" style={{ flex: 2, minWidth: 220 }}>
          <label htmlFor="annotation-path">Route path</label>
          <input
            id="annotation-path"
            className="input"
            value={values.routePath}
            onChange={(e) => update("routePath", e.target.value)}
            placeholder="/payments/{id}/refund"
            autoComplete="off"
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-field">
          <label className="graph-filters__checkbox">
            <input
              type="checkbox"
              checked={values.authRequired}
              onChange={(e) => update("authRequired", e.target.checked)}
            />
            Requires authentication
          </label>
        </div>

        {values.authRequired && (
          <>
            <div className="form-field" style={{ minWidth: 180 }}>
              <label htmlFor="annotation-auth-mechanism">Auth mechanism</label>
              <input
                id="annotation-auth-mechanism"
                className="input"
                value={values.authMechanism}
                onChange={(e) => update("authMechanism", e.target.value)}
                placeholder="jwt, session, api_key…"
                autoComplete="off"
              />
            </div>

            <div className="form-field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="annotation-roles">Required roles (comma-separated)</label>
              <input
                id="annotation-roles"
                className="input"
                value={values.requiredRoles}
                onChange={(e) => update("requiredRoles", e.target.value)}
                placeholder="admin, billing-ops"
                autoComplete="off"
              />
            </div>
          </>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="annotation-reference">Reference file path (optional)</label>
        <input
          id="annotation-reference"
          className="input"
          value={values.referencePath}
          onChange={(e) => update("referencePath", e.target.value)}
          placeholder="src/routes/payments.js"
          autoComplete="off"
        />
        <p className="hint">Where this endpoint is implemented, if it's in this codebase - shown as a note only.</p>
      </div>

      <div className="form-field">
        <label htmlFor="annotation-notes">Notes</label>
        <textarea
          id="annotation-notes"
          className="input"
          rows={3}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="e.g. Exposed only through the API gateway - not visible to the code parser."
        />
      </div>

      {submitError && (
        <p className="field-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : annotation ? "Save changes" : "Add endpoint"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
