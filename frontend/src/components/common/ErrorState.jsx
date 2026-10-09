/**
 * Renders an error with a concrete recovery action, per spec §42 - every
 * error must give the user something to do, not just a message.
 */
export function ErrorState({ title = "Something went wrong", error, actionLabel, onAction }) {
  const message = typeof error === "string" ? error : error?.message ?? "Please try again.";

  return (
    <div className="state-block card" role="alert">
      <div className="state-block__icon" aria-hidden="true">
        ⚠️
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
