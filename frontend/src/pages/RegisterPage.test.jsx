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
import { RegisterPage } from "./RegisterPage.jsx";

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
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

describe("RegisterPage", () => {
  it("registers and redirects to the dashboard", async () => {
    authApi.register.mockResolvedValue({
      token: "tok",
      user: { id: "user_1", name: "Ada Lovelace", email: "ada@example.com" },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery-staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.getByText("Applications dashboard")).toBeInTheDocument());
    expect(authApi.register).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct-horse-battery-staple",
    });
  });

  it("blocks submission for a password shorter than 8 characters without calling the server", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("shows the server's error message on a failed registration", async () => {
    authApi.register.mockRejectedValue({ message: "An account with this email already exists." });
    renderPage();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery-staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
  });
});
