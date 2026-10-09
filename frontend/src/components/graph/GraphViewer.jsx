import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";

// Exported so GraphLegend can render the same mapping the canvas
// actually draws with - one source of truth, never two lists to keep in
// sync.
export const KIND_COLORS = {
  MODULE: "#8890a1",
  CLASS: "#2451e0",
  FUNCTION: "#157a4c",
  METHOD: "#a6650a",
  API: "#c22b3f",
};

const KIND_RADIUS = {
  MODULE: 6,
  CLASS: 9,
  FUNCTION: 7,
  METHOD: 6,
  API: 8,
};

/**
 * Interactive graph visualization (spec §22): zoom, pan, node selection,
 * relationship highlighting, and bounded rendering (only ever draws the
 * subgraph it was handed - never the whole repository at once).
 */
export function GraphViewer({ nodes, edges, selectedNodeId, onSelectNode, width = 760, height = 520 }) {
  const svgRef = useRef(null);
  const zoomLayerRef = useRef(null);
  const [, forceRender] = useState(0);
  const simNodesRef = useRef([]);
  const simEdgesRef = useRef([]);
  const simulationRef = useRef(null);

  const nodesKey = useMemo(() => nodes.map((n) => n.id).join(","), [nodes]);
  const edgesKey = useMemo(() => edges.map((e) => e.id).join(","), [edges]);

  useEffect(() => {
    const idSet = new Set(nodes.map((n) => n.id));
    const simNodes = nodes.map((n) => ({ ...n }));
    const simEdges = edges
      .filter((e) => idSet.has(e.sourceId) && idSet.has(e.targetId))
      .map((e) => ({ ...e, source: e.sourceId, target: e.targetId }));

    simNodesRef.current = simNodes;
    simEdgesRef.current = simEdges;

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink(simEdges)
          .id((d) => d.id)
          .distance(85)
          .strength(0.25),
      )
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide((d) => (KIND_RADIUS[d.kind] ?? 6) + 14))
      .on("tick", () => forceRender((t) => t + 1));

    simulationRef.current = simulation;
    for (let i = 0; i < 80; i += 1) simulation.tick(); // settle before first paint
    simulation.stop(); // static layout - no continuous animation needed
    forceRender((t) => t + 1);

    return () => simulation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesKey, edgesKey, width, height]);

  useEffect(() => {
    if (!svgRef.current || !zoomLayerRef.current) return undefined;
    const svgSel = select(svgRef.current);
    const layerSel = select(zoomLayerRef.current);
    const zoomBehavior = zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => layerSel.attr("transform", event.transform));
    svgSel.call(zoomBehavior);
    svgSel.call(zoomBehavior.transform, zoomIdentity);
    return () => svgSel.on(".zoom", null);
  }, [nodesKey]);

  const connected = useMemo(() => {
    if (!selectedNodeId) return null;
    const nodeIds = new Set([selectedNodeId]);
    const edgeIds = new Set();
    for (const edge of simEdgesRef.current) {
      const sourceId = edge.source.id ?? edge.source;
      const targetId = edge.target.id ?? edge.target;
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        edgeIds.add(edge.id);
        nodeIds.add(sourceId);
        nodeIds.add(targetId);
      }
    }
    return { nodeIds, edgeIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, edgesKey]);

  if (nodes.length === 0) {
    return <div className="graph-empty text-muted">No nodes to display. Try a different search or filters.</div>;
  }

  return (
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="graph-canvas" role="img" aria-label="Knowledge graph">
      <g ref={zoomLayerRef}>
        {simEdgesRef.current.map((edge) => {
          const source = edge.source;
          const target = edge.target;
          if (typeof source !== "object" || typeof target !== "object") return null;
          const dimmed = connected && !connected.edgeIds.has(edge.id);
          return (
            <line
              key={edge.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              className={`graph-edge${dimmed ? " graph-edge--dimmed" : ""}${connected?.edgeIds.has(edge.id) ? " graph-edge--highlight" : ""}`}
            />
          );
        })}

        {simNodesRef.current.map((node) => {
          const dimmed = connected && !connected.nodeIds.has(node.id);
          const isSelected = node.id === selectedNodeId;
          const radius = KIND_RADIUS[node.kind] ?? 6;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
              className={`graph-node${dimmed ? " graph-node--dimmed" : ""}`}
              onClick={() => onSelectNode(isSelected ? null : node.id)}
              role="button"
              tabIndex={0}
              aria-label={`${node.kind}: ${node.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectNode(isSelected ? null : node.id);
              }}
            >
              <circle
                r={isSelected ? radius + 3 : radius}
                fill={KIND_COLORS[node.kind] ?? "#8890a1"}
                stroke={isSelected ? "#111827" : "#fff"}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              <text x={radius + 5} y={4} className="graph-node__label">
                {node.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
