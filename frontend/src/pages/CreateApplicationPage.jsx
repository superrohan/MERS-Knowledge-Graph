import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { startIndexing } from "../api/jobs.js";
import { ApplicationForm } from "../components/applications/ApplicationForm.jsx";
import { useToast } from "../components/common/ToastProvider.jsx";
import { useCreateApplication } from "../hooks/useApplications.js";

export function CreateApplicationPage() {
  const navigate = useNavigate();
  const createApplication = useCreateApplication();
  const showToast = useToast();
  const [submitError, setSubmitError] = useState(null);

  async function handleSubmit(values) {
    setSubmitError(null);
    try {
      const app = await createApplication.mutateAsync(values);
      // "Create & Analyze" is one user action but two API calls: create
      // the application, then immediately kick off indexing (spec §6).
      await startIndexing(app.id);
      showToast(`"${app.name}" created - analysis started`, { type: "success" });
      navigate(`/applications/${app.id}/processing`);
    } catch (err) {
      setSubmitError(err.message);
      showToast(err.message, { type: "error" });
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Create Application</h1>
      </div>
      <div style={{ maxWidth: 560 }}>
        <ApplicationForm
          onSubmit={handleSubmit}
          isSubmitting={createApplication.isPending}
          submitError={submitError}
        />
      </div>
    </div>
  );
}
