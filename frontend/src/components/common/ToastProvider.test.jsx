import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./ToastProvider.jsx";

function Trigger({ message, options }) {
  const showToast = useToast();
  return (
    <button type="button" onClick={() => showToast(message, options)}>
      Fire
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  it("shows a toast when triggered, and it disappears after its duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Trigger message="Application created" options={{ type: "success", duration: 1000 }} />
      </ToastProvider>,
    );

    screen.getByRole("button", { name: "Fire" }).click();
    expect(await screen.findByText("Application created")).toBeInTheDocument();

    vi.advanceTimersByTime(1100);
    await waitFor(() => expect(screen.queryByText("Application created")).not.toBeInTheDocument());
    vi.useRealTimers();
  });

  it("can be dismissed manually via its close button", async () => {
    render(
      <ToastProvider>
        <Trigger message="Endpoint removed" options={{ duration: 0 }} />
      </ToastProvider>,
    );

    screen.getByRole("button", { name: "Fire" }).click();
    const toast = await screen.findByText("Endpoint removed");
    expect(toast).toBeInTheDocument();

    screen.getByRole("button", { name: "Dismiss" }).click();
    await waitFor(() => expect(screen.queryByText("Endpoint removed")).not.toBeInTheDocument());
  });

  it("useToast is a safe no-op outside a provider", () => {
    function Standalone() {
      const showToast = useToast();
      showToast("should not throw");
      return <div>rendered</div>;
    }
    render(<Standalone />);
    expect(screen.getByText("rendered")).toBeInTheDocument();
  });
});
