import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useGitLabValidation.js", () => ({
  useGitLabValidation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: undefined,
  }),
}));

import { ApplicationForm } from "./ApplicationForm.jsx";

describe("ApplicationForm", () => {
  it("blocks submission and shows errors when required fields are empty", () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /create & analyze/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Application name is required.")).toBeInTheDocument();
    expect(screen.getByText("AA/application number is required.")).toBeInTheDocument();
    expect(screen.getByText("GitLab repository URL is required.")).toBeInTheDocument();
  });

  it("submits a single repository, defaulting branch to main", () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Application Name"), { target: { value: "Payment Platform" } });
    fireEvent.change(screen.getByLabelText("AA / Application Number"), { target: { value: "AA-12345" } });
    fireEvent.change(screen.getByLabelText("GitLab Repository URL"), {
      target: { value: "https://gitlab.com/team/payment-platform" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create & analyze/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Payment Platform",
      aaNumber: "AA-12345",
      repositories: [
        {
          name: undefined,
          repositoryUrl: "https://gitlab.com/team/payment-platform",
          branch: "main",
          isPrivate: false,
          accessToken: undefined,
        },
      ],
    });
  });

  it("rejects a repository URL that isn't a plausible GitLab URL", () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Application Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("AA / Application Number"), { target: { value: "AA-1" } });
    fireEvent.change(screen.getByLabelText("GitLab Repository URL"), { target: { value: "not-a-url" } });

    fireEvent.click(screen.getByRole("button", { name: /create & analyze/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid gitlab repository url/i)).toBeInTheDocument();
  });

  it("requires an access token once a repository is marked private", () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Application Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("AA / Application Number"), { target: { value: "AA-1" } });
    fireEvent.change(screen.getByLabelText("GitLab Repository URL"), {
      target: { value: "https://gitlab.com/team/secret" },
    });
    fireEvent.click(screen.getByLabelText("This repository is private"));

    fireEvent.click(screen.getByRole("button", { name: /create & analyze/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/access token is required/i)).toBeInTheDocument();
  });

  it("adds a second repository row, requiring a name on both once there is more than one", () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Application Name"), { target: { value: "Payment Platform" } });
    fireEvent.change(screen.getByLabelText("AA / Application Number"), { target: { value: "AA-12345" } });
    fireEvent.click(screen.getByRole("button", { name: /add another repository/i }));

    expect(screen.getAllByLabelText("GitLab Repository URL")).toHaveLength(2);
    expect(screen.getAllByLabelText(/Repository label/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /create & analyze/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Repository name is required when an application has more than one repository."),
    ).toHaveLength(2);
  });

  it("submits multiple repositories with distinct names", () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Application Name"), { target: { value: "Payment Platform" } });
    fireEvent.change(screen.getByLabelText("AA / Application Number"), { target: { value: "AA-12345" } });
    fireEvent.change(screen.getByLabelText("GitLab Repository URL"), {
      target: { value: "https://gitlab.com/team/frontend" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add another repository/i }));

    const urlInputs = screen.getAllByLabelText("GitLab Repository URL");
    fireEvent.change(urlInputs[1], { target: { value: "https://gitlab.com/team/backend" } });

    const nameInputs = screen.getAllByLabelText(/Repository label/);
    fireEvent.change(nameInputs[0], { target: { value: "Frontend" } });
    fireEvent.change(nameInputs[1], { target: { value: "Backend" } });

    fireEvent.click(screen.getByRole("button", { name: /create & analyze/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Payment Platform",
      aaNumber: "AA-12345",
      repositories: [
        {
          name: "Frontend",
          repositoryUrl: "https://gitlab.com/team/frontend",
          branch: "main",
          isPrivate: false,
          accessToken: undefined,
        },
        {
          name: "Backend",
          repositoryUrl: "https://gitlab.com/team/backend",
          branch: "main",
          isPrivate: false,
          accessToken: undefined,
        },
      ],
    });
  });
});
