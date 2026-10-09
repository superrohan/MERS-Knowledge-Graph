export function EmptyState({ icon = "\u{1F4C2}", title, description, action }) {
  return (
    <div className="state-block card">
      <div className="state-block__icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
