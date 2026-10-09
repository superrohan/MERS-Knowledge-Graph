import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/auth.js", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

import * as authApi from "../api/auth.js";
import { AuthProvider } from "../context/AuthContext.jsx";
import { LoginPage } from "./LoginPage.jsx";

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/applications" element={<div>Applications dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("logs in and redirects to the dashboard", async () => {
    authApi.login.mockResolvedValue({ token: "tok", user: { id: "user_1", name: "Ada", email: "ada@example.com" } });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery-staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Applications dashboard")).toBeInTheDocument());
    expect(authApi.login).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct-horse-battery-staple" });
  });

  it("shows the server's error message on a failed login", async () => {
    authApi.login.mockRejectedValue({ message: "Incorrect email or password." });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });
});
