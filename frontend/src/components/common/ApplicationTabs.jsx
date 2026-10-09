import { NavLink } from "react-router-dom";

export function ApplicationTabs({ applicationId, disabled = false }) {
  // API annotations are never gated on indexing status - a user can
  // declare an endpoint before, during, or after analysis completes.
  const alwaysEnabled = new Set(["Overview", "API Endpoints"]);
  const tabs = [
    { to: `/applications/${applicationId}`, label: "Overview", end: true },
    { to: `/applications/${applicationId}/knowledge-base`, label: "Knowledge Base" },
    { to: `/applications/${applicationId}/query`, label: "Query" },
    { to: `/applications/${applicationId}/knowledge-base/graph`, label: "Graph" },
    { to: `/applications/${applicationId}/api-annotations`, label: "API Endpoints" },
  ];

  return (
    <nav className="app-tabs" aria-label="Application sections">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `app-tabs__tab${isActive ? " app-tabs__tab--active" : ""}${disabled && !alwaysEnabled.has(tab.label) ? " app-tabs__tab--disabled" : ""}`}
          onClick={(e) => {
            if (disabled && !alwaysEnabled.has(tab.label)) e.preventDefault();
          }}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
