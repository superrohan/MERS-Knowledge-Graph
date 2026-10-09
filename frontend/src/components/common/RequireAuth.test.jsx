import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthProvider } from "../../context/AuthContext.jsx";
import { RequireAuth } from "./RequireAuth.jsx";

function renderAt(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <div>Protected content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("RequireAuth", () => {
  it("redirects to /login when there is no session", () => {
    renderAt("/protected");
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the protected content when a session exists", () => {
    localStorage.setItem(
      "ci_auth_session",
      JSON.stringify({ token: "tok", user: { id: "user_1", name: "Ada", email: "ada@example.com" } }),
    );
    renderAt("/protected");
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});
