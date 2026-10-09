import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { InstructionsPage } from "./InstructionsPage.jsx";

function renderPage() {
  return render(
    <MemoryRouter>
      <InstructionsPage />
    </MemoryRouter>,
  );
}

describe("InstructionsPage", () => {
  it("renders section headers collapsed by default, except the first", () => {
    renderPage();

    expect(screen.getByText("Getting started: creating an application")).toBeInTheDocument();
    expect(screen.getByText("Understanding the indexing progress page")).toBeInTheDocument();
    expect(screen.getByText("Reading the knowledge graph")).toBeInTheDocument();
    expect(screen.getByText("Declaring an API endpoint manually")).toBeInTheDocument();

    // The first section is expanded by default; a later one isn't.
    expect(screen.getByText((_, el) => el?.tagName === "LI" && el.textContent.includes("New Application"))).toBeInTheDocument();
    expect(screen.queryByText(/Not every endpoint is visible to the parser/)).not.toBeInTheDocument();
  });

  it("expands a section on click to reveal its content", () => {
    renderPage();

    fireEvent.click(screen.getByText("Declaring an API endpoint manually"));

    expect(screen.getByText(/Not every endpoint is visible to the parser/)).toBeInTheDocument();
    expect(screen.getByText("✓ Confirmed against code")).toBeInTheDocument();
    expect(screen.getByText("⚠ Conflicts with code")).toBeInTheDocument();
  });

  it("explains the graph node legend colors", () => {
    renderPage();

    fireEvent.click(screen.getByText("Reading the knowledge graph"));

    expect(screen.getByText("API endpoint")).toBeInTheDocument();
    expect(screen.getByText("Module / file")).toBeInTheDocument();
  });

  it("links back to the applications list", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Go to Applications" })).toHaveAttribute("href", "/applications");
  });
});
