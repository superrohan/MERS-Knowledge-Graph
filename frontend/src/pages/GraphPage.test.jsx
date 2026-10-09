import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mockUseApplication = vi.fn();
const mockUseKnowledgeGraph = vi.fn();
const mockGetSource = vi.fn();

vi.mock("../hooks/useApplications.js", () => ({ useApplication: (...args) => mockUseApplication(...args) }));
vi.mock("../hooks/useKnowledgeBase.js", () => ({ useKnowledgeGraph: (...args) => mockUseKnowledgeGraph(...args) }));
vi.mock("../api/source.js", () => ({ getSource: (...args) => mockGetSource(...args) }));

import { GraphPage } from "./GraphPage.jsx";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app_1/knowledge-base/graph"]}>
        <Routes>
          <Route path="/applications/:id/knowledge-base/graph" element={<GraphPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GraphPage", () => {
  it("selecting a node shows its relationships and opens the source viewer", async () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: "app_1",
        name: "Payment Platform",
        repositories: [{ id: "repo_1", name: "main", repoKey: "main", repositoryUrl: "https://gitlab.com/team/payment-platform", branch: "main", isPrivate: false }],
        lastIndexedCommits: { main: "abc123def456" },
      },
    });
    mockUseKnowledgeGraph.mockReturnValue({
      data: {
        nodes: [
          { id: "n1", kind: "CLASS", name: "AuthService", qualifiedName: "src.services.auth_service.AuthService", filePath: "src/services/auth_service.py", startLine: 19, endLine: 49 },
          { id: "n2", kind: "METHOD", name: "authenticate", qualifiedName: "src.services.auth_service.AuthService.authenticate", filePath: "src/services/auth_service.py", startLine: 26, endLine: 38 },
        ],
        edges: [{ id: "e1", sourceId: "n1", targetId: "n2", type: "DEFINES" }],
      },
      isLoading: false,
      isError: false,
    });
    mockGetSource.mockResolvedValue({
      filePath: "src/services/auth_service.py",
      startLine: 20,
      endLine: 55,
      totalLines: 60,
      lines: Array.from({ length: 36 }, (_, i) => `line ${20 + i}`),
    });

    renderPage();

    expect(screen.getByText("Select a node to see its details and relationships.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /CLASS: AuthService/i }));

    expect(screen.getByRole("heading", { name: "AuthService" })).toBeInTheDocument();
    expect(screen.getByText(/Relationships \(1\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open source" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mockGetSource).toHaveBeenCalledWith("app_1", expect.objectContaining({ path: "src/services/auth_service.py" }));
    expect(await screen.findByText("line 26")).toBeInTheDocument();
  });
});
