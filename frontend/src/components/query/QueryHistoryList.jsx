import { formatRelativeTime } from "../../utils/format.js";

export function QueryHistoryList({ history = [], activeQueryId, onSelect }) {
  if (history.length === 0) {
    return <p className="text-faint">No questions asked yet.</p>;
  }

  return (
    <ul className="query-history">
      {history.map((item) => (
        <li key={item.queryId}>
          <button
            type="button"
            className={`query-history__item${item.queryId === activeQueryId ? " query-history__item--active" : ""}`}
            onClick={() => onSelect(item.queryId)}
          >
            <div>{item.query}</div>
            <div className="text-faint" style={{ fontSize: 12 }}>
              {formatRelativeTime(item.createdAt)}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
