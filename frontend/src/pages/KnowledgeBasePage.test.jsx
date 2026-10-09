import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mockUseApplication = vi.fn();
const mockUseKnowledgeBaseStats = vi.fn();

vi.mock("../hooks/useApplications.js", () => ({
  useApplication: (...args) => mockUseApplication(...args),
}));
vi.mock("../hooks/useKnowledgeBase.js", () => ({
  useKnowledgeBaseStats: (...args) => mockUseKnowledgeBaseStats(...args),
}));
vi.mock("../api/jobs.js", () => ({ startIndexing: vi.fn() }));

import { KnowledgeBasePage } from "./KnowledgeBasePage.jsx";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app_1/knowledge-base"]}>
        <Routes>
          <Route path="/applications/:id/knowledge-base" element={<KnowledgeBasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("KnowledgeBasePage", () => {
  it("shows the not-ready empty state when the application isn't READY", () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", name: "Payment Platform", status: "NEW" }, isLoading: false, isError: false });
    mockUseKnowledgeBaseStats.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderPage();
    expect(screen.getByText("Knowledge Base Not Ready")).toBeInTheDocument();
  });

  it("shows real stats and navigation actions when READY", () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: "app_1",
        name: "Payment Platform",
        status: "READY",
        repositories: [{ id: "repo_1", name: "main", repoKey: "main", repositoryUrl: "https://gitlab.com/team/payment-platform", branch: "main", isPrivate: false }],
        lastIndexedCommits: { main: "abc123def456" },
        lastIndexedAt: "2026-08-25T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    });
    mockUseKnowledgeBaseStats.mockReturnValue({
      data: { files: 17, classes: 11, functions: 36, relationships: 131, chunks: 47 },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByText("131")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Query Knowledge Base" })).toHaveAttribute("href", "/applications/app_1/query");
    expect(screen.getByRole("link", { name: "View Graph" })).toHaveAttribute(
      "href",
      "/applications/app_1/knowledge-base/graph",
    );
  });
});
