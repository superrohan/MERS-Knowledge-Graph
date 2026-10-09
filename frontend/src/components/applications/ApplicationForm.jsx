import { useState } from "react";

import { useGitLabValidation } from "../../hooks/useGitLabValidation.js";

function makeRepo() {
  return {
    key: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `repo-${Date.now()}-${Math.random()}`,
    name: "",
    repositoryUrl: "",
    branch: "main",
    isPrivate: false,
    accessToken: "",
  };
}

function validateRepo(repo, requireName) {
  const errors = {};
  if (requireName && !repo.name.trim()) {
    errors.name = "Repository name is required when an application has more than one repository.";
  }
  if (!repo.repositoryUrl.trim()) {
    errors.repositoryUrl = "GitLab repository URL is required.";
  } else if (!/^(https?:\/\/|git@|file:\/\/)/.test(repo.repositoryUrl.trim())) {
    errors.repositoryUrl = "Enter a valid GitLab repository URL, e.g. https://gitlab.com/group/project";
  }
  if (repo.isPrivate && !repo.accessToken.trim()) {
    errors.accessToken = "This repository is marked private - an access token is required to clone it.";
  }
  return errors;
}

function RepositoryRow({ index, repo, showName, canRemove, onChange, onRemove, forceShowErrors }) {
  const gitlabValidation = useGitLabValidation();
  const [touchedState, setTouched] = useState({});
  const errors = validateRepo(repo, showName);
  const touched = forceShowErrors
    ? { name: true, repositoryUrl: true, accessToken: true, ...touchedState }
    : touchedState;

  function update(field, value) {
    onChange({ ...repo, [field]: value });
    if (field === "repositoryUrl" || field === "accessToken") gitlabValidation.reset();
  }

  function markTouched(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function handleUrlBlur() {
    markTouched("repositoryUrl");
    const fieldErrors = validateRepo(repo, showName);
    if (!fieldErrors.repositoryUrl && (!repo.isPrivate || repo.accessToken.trim())) {
      gitlabValidation.mutate(
        { repositoryUrl: repo.repositoryUrl.trim(), accessToken: repo.isPrivate ? repo.accessToken.trim() : undefined },
        {
          onSuccess: (result) => {
            onChange({
              ...repo,
              branch: repo.branch && repo.branch !== "main" ? repo.branch : result.defaultBranch ?? "main",
            });
          },
        },
      );
    }
  }

  const branches = gitlabValidation.data?.branches ?? [];
  const idFor = (field) => `repo-${field}-${repo.key}`;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>{showName ? repo.name.trim() || `Repository ${index + 1}` : "Repository"}</strong>
        {canRemove && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      {showName && (
        <div className="form-field">
          <label htmlFor={idFor("name")}>Repository label (e.g. "Frontend", "Backend")</label>
          <input
            id={idFor("name")}
            className={`input${touched.name && errors.name ? " has-error" : ""}`}
            value={repo.name}
            onChange={(e) => update("name", e.target.value)}
            onBlur={() => markTouched("name")}
            placeholder="Frontend"
            autoComplete="off"
          />
          {touched.name && errors.name && (
            <p className="field-error" role="alert">
              {errors.name}
            </p>
          )}
        </div>
      )}

      <div className="form-field">
        <label htmlFor={idFor("url")}>GitLab Repository URL</label>
        <input
          id={idFor("url")}
          className={`input${touched.repositoryUrl && errors.repositoryUrl ? " has-error" : ""}`}
          value={repo.repositoryUrl}
          onChange={(e) => update("repositoryUrl", e.target.value)}
          onBlur={handleUrlBlur}
          placeholder="https://gitlab.com/company/project"
          autoComplete="off"
        />
        {touched.repositoryUrl && errors.repositoryUrl && (
          <p className="field-error" role="alert">
            {errors.repositoryUrl}
          </p>
        )}
        {gitlabValidation.isPending && (
          <p className="hint">
            <span className="spinner" aria-hidden="true" style={{ width: 12, height: 12, marginRight: 6 }} />
            Validating repository…
          </p>
        )}
        {gitlabValidation.isSuccess && (
          <p className="hint" style={{ color: "var(--color-success)" }}>
            ✓ Repository verified: {gitlabValidation.data.repository.name}
          </p>
        )}
        {gitlabValidation.isError && (
          <p className="field-error" role="alert">
            {gitlabValidation.error.message}
          </p>
        )}
      </div>

      <div className="form-field">
        <label className="graph-filters__checkbox">
          <input type="checkbox" checked={repo.isPrivate} onChange={(e) => update("isPrivate", e.target.checked)} />
          This repository is private
        </label>
      </div>

      {repo.isPrivate && (
        <div className="form-field">
          <label htmlFor={idFor("token")}>GitLab Access Token (PAT)</label>
          <input
            id={idFor("token")}
            type="password"
            className={`input${touched.accessToken && errors.accessToken ? " has-error" : ""}`}
            value={repo.accessToken}
            onChange={(e) => update("accessToken", e.target.value)}
            onBlur={() => {
              markTouched("accessToken");
              handleUrlBlur();
            }}
            placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
            autoComplete="off"
          />
          {touched.accessToken && errors.accessToken && (
            <p className="field-error" role="alert">
              {errors.accessToken}
            </p>
          )}
          <p className="hint">
            Needed only to clone and index this private repository - it is stored for re-indexing but never shown
            again or returned to this or any other browser.
          </p>
        </div>
      )}

      <div className="form-field">
        <label htmlFor={idFor("branch")}>GitLab Branch</label>
        {branches.length > 0 ? (
          <select id={idFor("branch")} className="select" value={repo.branch} onChange={(e) => update("branch", e.target.value)}>
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={idFor("branch")}
            className="input"
            value={repo.branch}
            onChange={(e) => update("branch", e.target.value)}
            placeholder="main"
            autoComplete="off"
          />
        )}
        <p className="hint">Verify the repository URL above to choose from its actual branches.</p>
      </div>
    </div>
  );
}

export function ApplicationForm({ onSubmit, isSubmitting, submitError }) {
  const [name, setName] = useState("");
  const [aaNumber, setAaNumber] = useState("");
  const [repos, setRepos] = useState([makeRepo()]);
  const [topTouched, setTopTouched] = useState({});
  const [repoErrorsVisible, setRepoErrorsVisible] = useState(false);

  const showName = repos.length > 1;
  const topErrors = {};
  if (!name.trim()) topErrors.name = "Application name is required.";
  if (!aaNumber.trim()) topErrors.aaNumber = "AA/application number is required.";

  function updateRepo(index, next) {
    setRepos((prev) => prev.map((r, i) => (i === index ? next : r)));
  }

  function addRepo() {
    setRepos((prev) => [...prev, makeRepo()]);
  }

  function removeRepo(index) {
    setRepos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setTopTouched({ name: true, aaNumber: true });
    setRepoErrorsVisible(true);

    const repoErrors = repos.map((r) => validateRepo(r, showName));
    const hasErrors = Object.keys(topErrors).length > 0 || repoErrors.some((e) => Object.keys(e).length > 0);
    if (hasErrors) return;

    onSubmit({
      name: name.trim(),
      aaNumber: aaNumber.trim(),
      repositories: repos.map((r) => ({
        name: showName ? r.name.trim() : undefined,
        repositoryUrl: r.repositoryUrl.trim(),
        branch: r.branch.trim() || "main",
        isPrivate: r.isPrivate,
        accessToken: r.isPrivate ? r.accessToken.trim() : undefined,
      })),
    });
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="name">Application Name</label>
        <input
          id="name"
          className={`input${topTouched.name && topErrors.name ? " has-error" : ""}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTopTouched((prev) => ({ ...prev, name: true }))}
          placeholder="Payment Platform"
          autoComplete="off"
        />
        {topTouched.name && topErrors.name && (
          <p className="field-error" role="alert">
            {topErrors.name}
          </p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="aaNumber">AA / Application Number</label>
        <input
          id="aaNumber"
          className={`input${topTouched.aaNumber && topErrors.aaNumber ? " has-error" : ""}`}
          value={aaNumber}
          onChange={(e) => setAaNumber(e.target.value)}
          onBlur={() => setTopTouched((prev) => ({ ...prev, aaNumber: true }))}
          placeholder="AA-12345"
          autoComplete="off"
        />
        {topTouched.aaNumber && topErrors.aaNumber && (
          <p className="field-error" role="alert">
            {topErrors.aaNumber}
          </p>
        )}
      </div>

      <div className="text-faint" style={{ marginBottom: 6 }}>
        {repos.length > 1 ? `Repositories (${repos.length})` : "Repository"}
      </div>

      {repos.map((repo, index) => (
        <RepositoryRow
          key={repo.key}
          index={index}
          repo={repo}
          showName={showName}
          canRemove={repos.length > 1}
          forceShowErrors={repoErrorsVisible}
          onChange={(next) => updateRepo(index, next)}
          onRemove={() => removeRepo(index)}
        />
      ))}

      <div className="form-actions" style={{ justifyContent: "flex-start", marginBottom: 4 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addRepo}>
          + Add another repository
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Add a separate repository for each service this application spans - e.g. a React/Next.js frontend and a
        separate backend service - so calls between them appear as one connected knowledge graph.
      </p>

      {submitError && (
        <p className="field-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create & Analyze"}
        </button>
      </div>
    </form>
  );
}
