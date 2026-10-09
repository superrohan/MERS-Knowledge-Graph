import { useState } from "react";
import { useParams } from "react-router-dom";

import { AnnotationCard } from "../components/api-annotations/AnnotationCard.jsx";
import { AnnotationForm } from "../components/api-annotations/AnnotationForm.jsx";
import { ApplicationTabs } from "../components/common/ApplicationTabs.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";
import { ErrorState } from "../components/common/ErrorState.jsx";
import { LoadingState } from "../components/common/LoadingState.jsx";
import { useToast } from "../components/common/ToastProvider.jsx";
import { useApplication } from "../hooks/useApplications.js";
import {
  useApiAnnotations,
  useCreateApiAnnotation,
  useDeleteApiAnnotation,
  useUpdateApiAnnotation,
  useVerifyApiAnnotation,
} from "../hooks/useApiAnnotations.js";

const VERIFICATION_TOAST = {
  confirmed: "✓ Confirmed against the code",
  conflicting: "⚠ Conflicts with what the code actually shows",
  no_match: "⛔ No matching endpoint found in code",
  unverified: "Still unverified - no matching code to compare against yet",
};

/**
 * Lets a user declare information about an API endpoint themselves - a
 * protected admin route behind a gateway, an endpoint that isn't
 * decorated/registered in a way the parser recognizes, or just extra
 * auth/role context worth recording. Available whether or not the
 * application has finished indexing (spec: "if they want to tell some
 * information") - it's independent of the automatic extraction pipeline.
 */
export function ApiAnnotationsPage() {
  const { id } = useParams();
  const { data: app, isLoading: appLoading, isError: appError, error: appErrorObj, refetch: refetchApp } = useApplication(id);
  const annotationsQuery = useApiAnnotations(id);
  const createAnnotation = useCreateApiAnnotation(id);
  const updateAnnotation = useUpdateApiAnnotation(id);
  const deleteAnnotation = useDeleteApiAnnotation(id);
  const verifyAnnotation = useVerifyApiAnnotation(id);
  const showToast = useToast();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  if (appLoading) return <LoadingState label="Loading application…" />;
  if (appError) {
    return <ErrorState title="Couldn't load this application" error={appErrorObj} actionLabel="Retry" onAction={refetchApp} />;
  }

  async function handleCreate(payload) {
    const annotation = await createAnnotation.mutateAsync(payload);
    setShowAddForm(false);
    showToast(`"${annotation.name}" declared`, { type: "success" });
  }

  async function handleSave(annotationId, payload) {
    await updateAnnotation.mutateAsync({ annotationId, payload });
    setEditingId(null);
    showToast("Endpoint updated", { type: "success" });
  }

  async function handleDelete(annotationId) {
    if (!window.confirm("Remove this API annotation? This cannot be undone.")) return;
    setDeletingId(annotationId);
    try {
      await deleteAnnotation.mutateAsync(annotationId);
      showToast("Endpoint removed", { type: "success" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleVerify(annotationId) {
    setVerifyingId(annotationId);
    try {
      const result = await verifyAnnotation.mutateAsync(annotationId);
      showToast(VERIFICATION_TOAST[result.verificationStatus] ?? "Verification checked", {
        type: result.verificationStatus === "confirmed" ? "success" : "info",
      });
    } finally {
      setVerifyingId(null);
    }
  }

  const annotations = annotationsQuery.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{app.name}</h1>
          <div className="page-header__meta">Declared API Endpoints</div>
        </div>
        {!showAddForm && (
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            + Declare an endpoint
          </button>
        )}
      </div>

      <ApplicationTabs applicationId={app.id} />

      <p className="hint" style={{ marginBottom: 16 }}>
        Tell the knowledge base about an API endpoint directly - useful for endpoints gated behind a gateway, not
        auto-detected in code, or where you want to record auth/role requirements explicitly. Each declaration is
        automatically checked against what was actually detected by parsing the code; only a <strong>confirmed</strong>
        declaration is treated as fact in query answers - anything conflicting, unmatched, or not yet checked is
        clearly flagged instead of being taken at face value.
      </p>

      {showAddForm && (
        <div style={{ marginBottom: 16 }}>
          <AnnotationForm
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isSubmitting={createAnnotation.isPending}
            submitError={createAnnotation.isError ? createAnnotation.error.message : null}
          />
        </div>
      )}

      {annotationsQuery.isLoading && <LoadingState label="Loading declared endpoints…" />}

      {annotationsQuery.isError && (
        <ErrorState
          title="Couldn't load declared endpoints"
          error={annotationsQuery.error}
          actionLabel="Retry"
          onAction={annotationsQuery.refetch}
        />
      )}

      {annotationsQuery.isSuccess && annotations.length === 0 && !showAddForm && (
        <EmptyState
          icon="🔌"
          title="No declared endpoints yet"
          description="Add one to document an API this application exposes - especially anything the automatic scan can't see."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
              + Declare an endpoint
            </button>
          }
        />
      )}

      <div className="stack-md">
        {annotations.map((annotation) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            isEditing={editingId === annotation.id}
            onEdit={() => setEditingId(annotation.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(payload) => handleSave(annotation.id, payload)}
            onDelete={() => handleDelete(annotation.id)}
            onVerify={() => handleVerify(annotation.id)}
            isSaving={updateAnnotation.isPending}
            isDeleting={deletingId === annotation.id}
            isVerifying={verifyingId === annotation.id}
            saveError={updateAnnotation.isError ? updateAnnotation.error.message : null}
          />
        ))}
      </div>
    </div>
  );
}
