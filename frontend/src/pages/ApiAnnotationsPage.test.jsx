import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApplication = vi.fn();
const mockUseApiAnnotations = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockVerify = vi.fn();

vi.mock("../hooks/useApplications.js", () => ({
  useApplication: (...args) => mockUseApplication(...args),
}));
vi.mock("../hooks/useApiAnnotations.js", () => ({
  useApiAnnotations: (...args) => mockUseApiAnnotations(...args),
  useCreateApiAnnotation: () => ({ mutateAsync: mockCreate, isPending: false, isError: false }),
  useUpdateApiAnnotation: () => ({ mutateAsync: mockUpdate, isPending: false, isError: false }),
  useDeleteApiAnnotation: () => ({ mutateAsync: mockDelete, isPending: false, isError: false }),
  useVerifyApiAnnotation: () => ({ mutateAsync: mockVerify, isPending: false, isError: false }),
}));

import { ApiAnnotationsPage } from "./ApiAnnotationsPage.jsx";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app_1/api-annotations"]}>
        <Routes>
          <Route path="/applications/:id/api-annotations" element={<ApiAnnotationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ApiAnnotationsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state and reachable even when the application isn't READY", () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", name: "Payment Platform", status: "NEW" }, isLoading: false, isError: false });
    mockUseApiAnnotations.mockReturnValue({ data: [], isLoading: false, isError: false, isSuccess: true });

    renderPage();

    expect(screen.getByText("No declared endpoints yet")).toBeInTheDocument();
  });

  it("lists declared endpoints with their method, auth, and roles", () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", name: "Payment Platform", status: "READY" }, isLoading: false, isError: false });
    mockUseApiAnnotations.mockReturnValue({
      data: [
        {
          id: "manual_1",
          name: "Refund Payment",
          httpMethod: "POST",
          routePath: "/payments/{id}/refund",
          authRequired: true,
          authMechanism: "jwt",
          requiredRoles: ["admin"],
          notes: "Gated behind the API gateway.",
          verificationStatus: "conflicting",
          verificationNotes: "Code shows auth_required=false for this route.",
        },
      ],
      isLoading: false,
      isError: false,
      isSuccess: true,
    });

    renderPage();

    expect(screen.getByText("Refund Payment")).toBeInTheDocument();
    expect(screen.getByText("POST")).toBeInTheDocument();
    expect(screen.getByText("/payments/{id}/refund")).toBeInTheDocument();
    expect(screen.getByText(/Roles: admin/)).toBeInTheDocument();
    expect(screen.getByText("Gated behind the API gateway.")).toBeInTheDocument();
    expect(screen.getByText(/Conflicts with code/)).toBeInTheDocument();
    expect(screen.getByText("Code shows auth_required=false for this route.")).toBeInTheDocument();
  });

  it("re-checks a declaration against the code graph", async () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", name: "Payment Platform", status: "READY" }, isLoading: false, isError: false });
    mockUseApiAnnotations.mockReturnValue({
      data: [{ id: "manual_1", name: "Refund Payment", verificationStatus: "unverified" }],
      isLoading: false,
      isError: false,
      isSuccess: true,
    });
    mockVerify.mockResolvedValue({ id: "manual_1", verificationStatus: "confirmed" });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /re-check against code/i }));

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith("manual_1"));
  });

  it("submits a new declared endpoint", async () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", name: "Payment Platform", status: "NEW" }, isLoading: false, isError: false });
    mockUseApiAnnotations.mockReturnValue({ data: [], isLoading: false, isError: false, isSuccess: true });
    mockCreate.mockResolvedValue({ id: "manual_1" });

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /declare an endpoint/i })[0]);
    fireEvent.change(screen.getByLabelText("Endpoint name"), { target: { value: "Refund Payment" } });
    fireEvent.change(screen.getByLabelText("Route path"), { target: { value: "/payments/{id}/refund" } });
    fireEvent.click(screen.getByRole("button", { name: /add endpoint/i }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Refund Payment", routePath: "/payments/{id}/refund" }),
      ),
    );
  });

  it("blocks submission when the name is empty", () => {
    mockUseApplication.mockReturnValue({ data: { id: "app_1", name: "Payment Platform", status: "NEW" }, isLoading: false, isError: false });
    mockUseApiAnnotations.mockReturnValue({ data: [], isLoading: false, isError: false, isSuccess: true });

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /declare an endpoint/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /add endpoint/i }));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Endpoint name is required.")).toBeInTheDocument();
  });
});
