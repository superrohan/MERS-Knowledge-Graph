export const PROCESSING_STAGES = [
  { key: "CLONING", label: "Repository connected" },
  { key: "SCANNING", label: "Repository scanned" },
  { key: "PARSING", label: "Python files parsed" },
  { key: "BUILDING_GRAPH", label: "Building knowledge graph" },
  { key: "CREATING_CHUNKS", label: "Creating semantic chunks" },
  { key: "GENERATING_EMBEDDINGS", label: "Generating embeddings" },
  { key: "BUILDING_VECTOR_INDEX", label: "Building vector index" },
  { key: "FINALIZING", label: "Finalizing" },
];

export function stageIndex(status) {
  if (status === "COMPLETED") return PROCESSING_STAGES.length;
  return PROCESSING_STAGES.findIndex((s) => s.key === status);
}
