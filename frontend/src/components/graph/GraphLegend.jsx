import { KIND_COLORS } from "./GraphViewer.jsx";

const KIND_LABELS = {
  MODULE: "Module / file",
  CLASS: "Class",
  FUNCTION: "Function",
  METHOD: "Method",
  API: "API endpoint",
};

/** Explains what the dots on the canvas mean - node color is otherwise
 * undocumented anywhere in the UI itself. */
export function GraphLegend() {
  return (
    <div className="graph-legend">
      <div className="text-faint" style={{ marginBottom: 6 }}>
        Node types
      </div>
      {Object.entries(KIND_COLORS).map(([kind, color]) => (
        <div key={kind} className="graph-legend__row">
          <span className="graph-legend__swatch" style={{ background: color }} aria-hidden="true" />
          {KIND_LABELS[kind] ?? kind}
        </div>
      ))}
    </div>
  );
}
