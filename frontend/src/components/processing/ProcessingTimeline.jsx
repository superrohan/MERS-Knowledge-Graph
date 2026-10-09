import { PROCESSING_STAGES, stageIndex } from "../../utils/processingStages.js";

export function ProcessingTimeline({ status }) {
  const currentIndex = stageIndex(status);

  return (
    <ul className="timeline" aria-label="Processing steps">
      {PROCESSING_STAGES.map((stage, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
        return (
          <li key={stage.key} className={`timeline__item timeline__item--${state}`}>
            <span className="timeline__marker" aria-hidden="true">
              {state === "done" ? "✓" : state === "active" ? "●" : "○"}
            </span>
            <span>{stage.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
