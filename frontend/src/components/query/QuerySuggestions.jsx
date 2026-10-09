const SUGGESTIONS = [
  "How does authentication work?",
  "Explain the payment flow",
  "What calls PaymentService?",
  "What depends on UserRepository?",
  "Where is JWT validation implemented?",
];

/** These are only suggestions - the user can ask anything (spec §46). */
export function QuerySuggestions({ onSelect }) {
  return (
    <div>
      <div className="text-faint" style={{ marginBottom: 8 }}>
        Suggested questions
      </div>
      <ul className="query-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button type="button" className="btn-link" onClick={() => onSelect(suggestion)}>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
