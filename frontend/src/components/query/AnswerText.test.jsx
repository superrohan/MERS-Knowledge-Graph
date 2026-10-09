import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnswerText } from "./AnswerText.jsx";

describe("AnswerText", () => {
  it("renders headings and bullet points", () => {
    render(<AnswerText text={"### Step 1\n- first\n- second"} onOpenSource={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Step 1" })).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("turns file:line references into clickable citation chips that open the source viewer", () => {
    const onOpenSource = vi.fn();
    render(
      <AnswerText
        text="Authentication is handled by AuthService (src/services/auth_service.py:31-72)."
        onOpenSource={onOpenSource}
      />,
    );

    const chip = screen.getByRole("button", { name: "src/services/auth_service.py:31-72" });
    fireEvent.click(chip);

    expect(onOpenSource).toHaveBeenCalledWith({
      filePath: "src/services/auth_service.py",
      startLine: 31,
      endLine: 72,
    });
  });

  it("renders inline code spans", () => {
    render(<AnswerText text="Call `authenticate()` to log in." onOpenSource={vi.fn()} />);
    expect(screen.getByText("authenticate()").tagName).toBe("CODE");
  });
});
