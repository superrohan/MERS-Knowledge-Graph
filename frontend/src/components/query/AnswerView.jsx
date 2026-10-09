import { AnswerText } from "./AnswerText.jsx";
import { Citation } from "./Citation.jsx";
import { GraphEvidence } from "./GraphEvidence.jsx";

const BASIS_LABELS = {
  FACT: "Fact",
  INFERENCE: "Inference",
  UNCERTAIN: "Uncertain",
};

export function AnswerView({ result, onOpenSource }) {
  return (
    <div className="answer-view">
      <div className="answer-view__question">{result.query}</div>

      {result.basis && result.basis !== "FACT" && (
        <span className={`badge badge--${result.basis.toLowerCase()}`}>{BASIS_LABELS[result.basis] ?? result.basis}</span>
      )}

      <AnswerText text={result.answer} onOpenSource={onOpenSource} />

      {result.citations?.length > 0 && (
        <div className="answer-view__citations">
          <div className="text-faint" style={{ marginBottom: 8 }}>
            Sources
          </div>
          <ul className="citation-list">
            {result.citations.map((citation, i) => (
              <Citation key={citation.symbolId ?? `${citation.filePath}-${i}`} citation={citation} index={i} onOpenSource={onOpenSource} />
            ))}
          </ul>
        </div>
      )}

      <GraphEvidence graphPath={result.graphPath} />
    </div>
  );
}
