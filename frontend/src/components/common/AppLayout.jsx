import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext.jsx";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/applications" className="topbar__brand">
          Code Intelligence
        </NavLink>
        <div className="topbar__user-menu">
          <span className="topbar__user" title={user?.email}>
            {user?.name ?? "…"}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Primary">
        <div className="sidebar__cta">
          <NavLink to="/applications/new" className="btn btn-primary btn-sm" style={{ width: "100%" }}>
            + New Application
          </NavLink>
        </div>
        {/* Deliberately no `end` here (unlike Instructions below) - a nested
            route like /applications/123/graph should still highlight this
            link, since it's still "in" the Applications section. */}
        <NavLink
          to="/applications"
          className={({ isActive }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`}
        >
          <span className="sidebar__icon" aria-hidden="true">📁</span> Applications
        </NavLink>
        <NavLink
          to="/instructions"
          className={({ isActive }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`}
        >
          <span className="sidebar__icon" aria-hidden="true">📖</span> Instructions
        </NavLink>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
