import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../api/gitlab.js", () => ({
  validateGitLabRepository: vi.fn().mockResolvedValue({
    repository: { name: "payment-platform", defaultBranch: "develop", visibility: "private" },
    defaultBranch: "develop",
    branches: ["develop", "main", "release"],
  }),
}));

import { validateGitLabRepository } from "../../api/gitlab.js";
import { ApplicationForm } from "./ApplicationForm.jsx";

function renderWithClient(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ApplicationForm GitLab validation", () => {
  it("validates the repository on blur and populates branches from the response", async () => {
    renderWithClient(<ApplicationForm onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("GitLab Repository URL"), {
      target: { value: "https://gitlab.com/team/payment-platform" },
    });
    fireEvent.blur(screen.getByLabelText("GitLab Repository URL"));

    expect(await screen.findByText(/repository verified: payment-platform/i)).toBeInTheDocument();
    expect(validateGitLabRepository.mock.calls[0][0]).toEqual({
      repositoryUrl: "https://gitlab.com/team/payment-platform",
      accessToken: undefined,
    });

    const branchSelect = screen.getByLabelText("GitLab Branch");
    expect(branchSelect.tagName).toBe("SELECT");
    await waitFor(() => expect(branchSelect.value).toBe("develop"));
    expect(screen.getByRole("option", { name: "main" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "release" })).toBeInTheDocument();
  });

  it("includes the access token when the repository is marked private", async () => {
    renderWithClient(<ApplicationForm onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("GitLab Repository URL"), {
      target: { value: "https://gitlab.com/team/payment-platform" },
    });
    fireEvent.click(screen.getByLabelText("This repository is private"));
    fireEvent.change(screen.getByLabelText("GitLab Access Token (PAT)"), {
      target: { value: "glpat-example-token" },
    });
    fireEvent.blur(screen.getByLabelText("GitLab Access Token (PAT)"));

    await waitFor(() => expect(validateGitLabRepository).toHaveBeenCalled());
    expect(validateGitLabRepository.mock.calls.at(-1)[0]).toEqual({
      repositoryUrl: "https://gitlab.com/team/payment-platform",
      accessToken: "glpat-example-token",
    });
  });
});
