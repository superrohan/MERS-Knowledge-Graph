import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProcessingTimeline } from "./ProcessingTimeline.jsx";

describe("ProcessingTimeline", () => {
  it("marks earlier stages done, the current stage active, and later stages pending", () => {
    render(<ProcessingTimeline status="BUILDING_GRAPH" />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("timeline__item--done"); // CLONING
    expect(items[2]).toHaveClass("timeline__item--done"); // PARSING
    expect(items[3]).toHaveClass("timeline__item--active"); // BUILDING_GRAPH
    expect(items[4]).toHaveClass("timeline__item--pending"); // CREATING_CHUNKS
  });

  it("marks every stage done once completed", () => {
    render(<ProcessingTimeline status="COMPLETED" />);
    const items = screen.getAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveClass("timeline__item--done");
    }
  });
});
