import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const mockUseApplication = vi.fn();
const mockUseAuthorizations = vi.fn();

vi.mock("../hooks/useApplications.js", () => ({
  useApplication: (...args) => mockUseApplication(...args),
  useDeleteApplication: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/useAuthorizations.js", () => ({
  useAuthorizations: (...args) => mockUseAuthorizations(...args),
}));

import { ApplicationPage } from "./ApplicationPage.jsx";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app_1"]}>
        <Routes>
          <Route path="/applications/:id" element={<ApplicationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseApp = {
  id: "app_1",
  name: "Payment Platform",
  aaNumber: "AA-12345",
  status: "READY",
  repositories: [{ id: "repo_1", name: "main", repositoryUrl: "https://gitlab.com/team/payment-platform", branch: "main", isPrivate: false }],
  lastIndexedAt: "2026-08-01T00:00:00.000Z",
  stats: { files: 10, classes: 2, functions: 5, relationships: 3, chunks: 8 },
};

describe("ApplicationPage authorization section", () => {
  it("shows the dummy authorization requirements fetched for this application's AA number", () => {
    mockUseApplication.mockReturnValue({ data: baseApp, isLoading: false, isError: false });
    mockUseAuthorizations.mockReturnValue({
      data: {
        aaNumber: "AA-12345",
        source: "dummy",
        authorizations: [
          { code: "AUTH_READ_CUSTOMER_DATA", name: "Read Customer Data", description: "Allows read access.", requiredRole: "customer-data-reader" },
        ],
      },
    });

    renderPage();

    expect(screen.getByText(/Authorization requirements \(AA-12345\)/)).toBeInTheDocument();
    expect(screen.getByText("Stub data")).toBeInTheDocument();
    expect(screen.getByText("customer-data-reader")).toBeInTheDocument();
    expect(screen.getByText(/Read Customer Data/)).toBeInTheDocument();
  });

  it("renders nothing extra while the authorization fetch hasn't resolved", () => {
    mockUseApplication.mockReturnValue({ data: baseApp, isLoading: false, isError: false });
    mockUseAuthorizations.mockReturnValue({ data: undefined });

    renderPage();

    expect(screen.queryByText(/Authorization requirements/)).not.toBeInTheDocument();
  });
});
