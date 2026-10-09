import { formatNumber } from "../../utils/format.js";

const FIELDS = [
  ["files", "Repository files"],
  ["parsedFiles", "Parsed files"],
  ["symbols", "Symbols discovered"],
  ["relationships", "Relationships discovered"],
  ["chunks", "Code chunks"],
  ["embeddings", "Embeddings"],
];

const LANGUAGE_LABELS = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
};

export function ProcessingStats({ stats }) {
  if (!stats) return null;

  const languages = Object.entries(stats.languages ?? {}).filter(([, count]) => count > 0);

  return (
    <div>
      <dl className="processing-stats">
        {FIELDS.map(([key, label]) => (
          <div key={key} className="processing-stats__item">
            <dt>{label}</dt>
            <dd>{formatNumber(stats[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      {languages.length > 1 && (
        <p className="text-faint" style={{ marginTop: 10 }}>
          {languages.map(([lang, count]) => `${LANGUAGE_LABELS[lang] ?? lang}: ${formatNumber(count)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
