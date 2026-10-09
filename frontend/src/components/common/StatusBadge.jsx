const LABELS = {
  NEW: "Setup",
  CONFIGURING: "Configuring",
  QUEUED: "Waiting",
  PROCESSING: "Analyzing",
  READY: "Ready",
  FAILED: "Failed",
};

export function StatusBadge({ status }) {
  const label = LABELS[status] ?? status;
  const modifier = (status ?? "new").toLowerCase();
  return <span className={`badge badge--${modifier}`}>{label}</span>;
}
