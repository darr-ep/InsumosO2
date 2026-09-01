import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Throws on the first render only, so "Reintentar" (which just resets
// internal state and re-renders the same children) can be proven to
// recover once the underlying condition clears — a real render crash
// wouldn't normally self-heal like this, but it isolates the reset
// mechanism itself from whatever transient cause a real crash would have.
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <p>Contenido real</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React itself logs the caught error to console.error in addition to
    // this component's own logging — silenced here so the test output
    // isn't spammed by an error we're deliberately triggering.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Contenido real")).toBeInTheDocument();
  });

  it("shows the fallback UI instead of crashing when a child throws during render", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Contenido real")).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it("recovers via 'Reintentar' once the underlying condition clears", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();

    // Same boundary instance, new child props — mirrors a real screen
    // re-rendering after whatever caused the crash resolves (e.g. a
    // refetch). The boundary's own `hasError` state doesn't clear just
    // because its children's props changed: while `hasError` is true,
    // `render()` always returns the fallback and never re-mounts
    // `children`, so the fallback stays up until "Reintentar" is clicked.
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(screen.getByText("Contenido real")).toBeInTheDocument();
  });

  it("offers 'Recargar página' which reloads the page", async () => {
    const user = userEvent.setup();
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Recargar página" }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
