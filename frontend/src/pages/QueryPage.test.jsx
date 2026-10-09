import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mockUseApplication = vi.fn();
const mockSubmitQuery = vi.fn();
const mockUseQueryHistory = vi.fn();

vi.mock("../hooks/useApplications.js", () => ({ useApplication: (...args) => mockUseApplication(...args) }));
vi.mock("../hooks/useQueries.js", () => ({
  useSubmitQuery: () => ({ mutateAsync: mockSubmitQuery, isPending: false, isError: false }),
  useQueryHistory: (...args) => mockUseQueryHistory(...args),
}));
vi.mock("../api/queries.js", () => ({ getQueryHistoryItem: vi.fn() }));

import { QueryPage } from "./QueryPage.jsx";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app_1/query"]}>
        <Routes>
          <Route path="/applications/:id/query" element={<QueryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("QueryPage", () => {
  it("shows the not-ready empty state when the knowledge base isn't READY", () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", status: "NEW" }, isLoading: false });
    mockUseQueryHistory.mockReturnValue({ data: [], isLoading: false });

    renderPage();
    expect(screen.getByText("Knowledge Base Not Ready")).toBeInTheDocument();
  });

  it("submits a question and renders the grounded answer with citations", async () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: "app_1",
        name: "Payment Platform",
        status: "READY",
        repositories: [{ id: "repo_1", name: "main", repoKey: "main", repositoryUrl: "https://gitlab.com/team/payment-platform", branch: "main", isPrivate: false }],
        lastIndexedCommits: {},
      },
      isLoading: false,
    });
    mockUseQueryHistory.mockReturnValue({ data: [], isLoading: false });
    mockSubmitQuery.mockResolvedValue({
      queryId: "query_1",
      query: "How does authentication work?",
      answer: "AuthService handles it (src/services/auth_service.py:31-72).",
      basis: "FACT",
      citations: [{ filePath: "src/services/auth_service.py", startLine: 31, endLine: 72, symbolName: "AuthService.authenticate" }],
      graphPath: [{ source: "LoginController.login", relationship: "CALLS", target: "AuthService.authenticate" }],
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("Ask anything about this codebase"), {
      target: { value: "How does authentication work?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask →" }));

    // Flush the mutateAsync promise chain (React 19 schedules the
    // resulting state update on a macrotask outside the click's own
    // event handling, so a microtask-only await isn't enough here).
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await screen.findByText("How does authentication work?")).toBeInTheDocument();
    expect(mockSubmitQuery).toHaveBeenCalledWith("How does authentication work?");
    expect(screen.getByText((_, el) => el?.textContent === "1. AuthService.authenticate")).toBeInTheDocument();
    expect(screen.getByText(/Show how we found this/)).toBeInTheDocument();
  });

  it("fills the input from a suggested question", () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: "app_1",
        name: "Payment Platform",
        status: "READY",
        repositories: [{ id: "repo_1", name: "main", repoKey: "main", repositoryUrl: "https://gitlab.com/team/payment-platform", branch: "main", isPrivate: false }],
        lastIndexedCommits: {},
      },
      isLoading: false,
    });
    mockUseQueryHistory.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "How does authentication work?" }));
    expect(mockSubmitQuery).toHaveBeenCalledWith("How does authentication work?");
  });
});
