export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p style={{ marginTop: 10 }}>{label}</p>
    </div>
  );
}
