import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GraphViewer } from "./GraphViewer.jsx";

const nodes = [
  { id: "n1", kind: "CLASS", name: "AuthService", qualifiedName: "src.services.auth_service.AuthService", filePath: "src/services/auth_service.py", startLine: 1, endLine: 10 },
  { id: "n2", kind: "METHOD", name: "authenticate", qualifiedName: "src.services.auth_service.AuthService.authenticate", filePath: "src/services/auth_service.py", startLine: 2, endLine: 8 },
];
const edges = [{ id: "e1", sourceId: "n1", targetId: "n2", type: "DEFINES" }];

describe("GraphViewer", () => {
  it("renders a bounded set of nodes without crashing", () => {
    render(<GraphViewer nodes={nodes} edges={edges} selectedNodeId={null} onSelectNode={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Knowledge graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CLASS: AuthService/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /METHOD: authenticate/i })).toBeInTheDocument();
  });

  it("shows an empty message when there are no nodes", () => {
    render(<GraphViewer nodes={[]} edges={[]} selectedNodeId={null} onSelectNode={vi.fn()} />);
    expect(screen.getByText(/no nodes to display/i)).toBeInTheDocument();
  });

  it("calls onSelectNode when a node is clicked", () => {
    const onSelectNode = vi.fn();
    render(<GraphViewer nodes={nodes} edges={edges} selectedNodeId={null} onSelectNode={onSelectNode} />);
    fireEvent.click(screen.getByRole("button", { name: /CLASS: AuthService/i }));
    expect(onSelectNode).toHaveBeenCalledWith("n1");
  });
});
