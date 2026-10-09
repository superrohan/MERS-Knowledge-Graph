import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mockUseApplication = vi.fn();
const mockUseProcessingJob = vi.fn();

vi.mock("../hooks/useApplications.js", () => ({
  useApplication: (...args) => mockUseApplication(...args),
  applicationKey: (id) => ["applications", id],
}));
vi.mock("../hooks/useProcessingJob.js", () => ({
  useProcessingJob: (...args) => mockUseProcessingJob(...args),
}));
vi.mock("../api/jobs.js", () => ({
  startIndexing: vi.fn(),
  cancelJob: vi.fn(),
  getJob: vi.fn(),
  jobEventsUrl: vi.fn(),
}));

import { ProcessingPage } from "./ProcessingPage.jsx";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app_1/processing"]}>
        <Routes>
          <Route path="/applications/:id/processing" element={<ProcessingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProcessingPage", () => {
  it("shows live progress, timeline, and stats while a job is running", () => {
    mockUseApplication.mockReturnValue({
      data: { id: "app_1", name: "Payment Platform", status: "PROCESSING", activeJobId: "job_1" },
      isLoading: false,
      isError: false,
    });
    mockUseProcessingJob.mockReturnValue({
      job: {
        status: "BUILDING_GRAPH",
        progress: 64,
        message: "Building knowledge graph",
        stats: { files: 1248, symbols: 8932, relationships: 21421, chunks: 0, embeddings: 0 },
        logs: [],
      },
      connection: "live",
    });

    renderPage();

    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getAllByText("Building knowledge graph").length).toBeGreaterThan(0);
    expect(screen.getByText("8,932")).toBeInTheDocument();
  });

  it("shows the success screen with a Start Querying action when completed", () => {
    mockUseApplication.mockReturnValue({
      data: { id: "app_1", name: "Payment Platform", status: "PROCESSING", activeJobId: "job_1" },
      isLoading: false,
      isError: false,
    });
    mockUseProcessingJob.mockReturnValue({
      job: {
        status: "COMPLETED",
        progress: 100,
        message: "Indexing complete",
        stats: { files: 17, symbols: 64, relationships: 131, chunks: 47, embeddings: 47 },
        commitHash: "abc123def456",
        logs: [],
      },
      connection: "live",
    });

    renderPage();

    expect(screen.getByText("Knowledge Base Ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Querying" })).toHaveAttribute(
      "href",
      "/applications/app_1/query",
    );
  });

  it("shows the failure screen with Retry and Back actions", () => {
    mockUseApplication.mockReturnValue({
      data: { id: "app_1", name: "Payment Platform", status: "PROCESSING", activeJobId: "job_1" },
      isLoading: false,
      isError: false,
    });
    mockUseProcessingJob.mockReturnValue({
      job: {
        status: "FAILED",
        progress: 40,
        message: "Generating embeddings",
        error: "Embedding provider unavailable.",
        stats: {},
        logs: [],
      },
      connection: "live",
    });

    renderPage();

    expect(screen.getByText("Knowledge Base Creation Failed")).toBeInTheDocument();
    expect(screen.getByText("Embedding provider unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Application" })).toBeInTheDocument();
  });
});
