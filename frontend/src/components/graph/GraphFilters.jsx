const NODE_TYPES = ["MODULE", "CLASS", "FUNCTION", "METHOD", "API"];
const RELATIONSHIP_TYPES = ["CALLS", "IMPORTS", "EXTENDS", "DEFINES", "USES", "TESTS", "CALLS_API"];

export function GraphFilters({ search, onSearchChange, nodeTypes, onNodeTypesChange, relationshipTypes, onRelationshipTypesChange }) {
  function toggle(list, value, onChange) {
    if (list.includes(value)) onChange(list.filter((v) => v !== value));
    else onChange([...list, value]);
  }

  return (
    <div className="graph-filters">
      <div className="form-field" style={{ marginBottom: 14 }}>
        <label htmlFor="graph-search">Search nodes</label>
        <input
          id="graph-search"
          className="input"
          placeholder="e.g. AuthService"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="graph-filters__group">
        <div className="text-faint" style={{ marginBottom: 6 }}>
          Node type
        </div>
        {NODE_TYPES.map((type) => (
          <label key={type} className="graph-filters__checkbox">
            <input
              type="checkbox"
              checked={nodeTypes.length === 0 || nodeTypes.includes(type)}
              onChange={() => toggle(nodeTypes.length === 0 ? NODE_TYPES.filter((t) => t !== type) : nodeTypes, type, onNodeTypesChange)}
            />
            {type}
          </label>
        ))}
      </div>

      <div className="graph-filters__group">
        <div className="text-faint" style={{ marginBottom: 6 }}>
          Relationship
        </div>
        {RELATIONSHIP_TYPES.map((type) => (
          <label key={type} className="graph-filters__checkbox">
            <input
              type="checkbox"
              checked={relationshipTypes.length === 0 || relationshipTypes.includes(type)}
              onChange={() =>
                toggle(
                  relationshipTypes.length === 0 ? RELATIONSHIP_TYPES.filter((t) => t !== type) : relationshipTypes,
                  type,
                  onRelationshipTypesChange,
                )
              }
            />
            {type}
          </label>
        ))}
      </div>
    </div>
  );
}
