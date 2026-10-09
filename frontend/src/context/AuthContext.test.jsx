import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/auth.js", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

import * as authApi from "../api/auth.js";
import { AuthProvider, useAuth } from "./AuthContext.jsx";

function Probe() {
  const { user, isAuthenticated, login, register, logout } = useAuth();
  return (
    <div>
      <div data-testid="state">{isAuthenticated ? `in:${user.name}` : "out"}</div>
      <button onClick={() => login("a@example.com", "pw")}>login</button>
      <button onClick={() => register("New User", "n@example.com", "pw")}>register</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AuthProvider / useAuth", () => {
  it("starts unauthenticated with no stored session", () => {
    renderProbe();
    expect(screen.getByTestId("state")).toHaveTextContent("out");
  });

  it("restores a session already in localStorage on mount", () => {
    localStorage.setItem(
      "ci_auth_session",
      JSON.stringify({ token: "tok", user: { id: "user_1", name: "Ada", email: "ada@example.com" } }),
    );
    renderProbe();
    expect(screen.getByTestId("state")).toHaveTextContent("in:Ada");
  });

  it("login stores the session and updates state", async () => {
    authApi.login.mockResolvedValue({ token: "tok2", user: { id: "user_2", name: "Bob", email: "bob@example.com" } });
    renderProbe();

    await act(async () => {
      screen.getByRole("button", { name: "login" }).click();
    });

    expect(screen.getByTestId("state")).toHaveTextContent("in:Bob");
    expect(JSON.parse(localStorage.getItem("ci_auth_session")).token).toBe("tok2");
  });

  it("register stores the session and updates state", async () => {
    authApi.register.mockResolvedValue({
      token: "tok3",
      user: { id: "user_3", name: "New User", email: "n@example.com" },
    });
    renderProbe();

    await act(async () => {
      screen.getByRole("button", { name: "register" }).click();
    });

    expect(screen.getByTestId("state")).toHaveTextContent("in:New User");
  });

  it("logout clears the session even if the server call fails", async () => {
    localStorage.setItem(
      "ci_auth_session",
      JSON.stringify({ token: "tok", user: { id: "user_1", name: "Ada", email: "ada@example.com" } }),
    );
    authApi.logout.mockRejectedValue(new Error("network error"));
    renderProbe();

    await act(async () => {
      screen.getByRole("button", { name: "logout" }).click();
    });

    expect(screen.getByTestId("state")).toHaveTextContent("out");
    expect(localStorage.getItem("ci_auth_session")).toBeNull();
  });

  it("clears the session when an auth:unauthorized event fires (e.g. a 401 from any request)", async () => {
    localStorage.setItem(
      "ci_auth_session",
      JSON.stringify({ token: "tok", user: { id: "user_1", name: "Ada", email: "ada@example.com" } }),
    );
    renderProbe();
    expect(screen.getByTestId("state")).toHaveTextContent("in:Ada");

    await act(async () => {
      window.dispatchEvent(new Event("auth:unauthorized"));
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
  });
});
