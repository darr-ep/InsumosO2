import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from "react-router";
import { ErrorBoundary, RouteErrorBoundary } from "@/components/ErrorBoundary";

// design-fidelity Slice D3 scoped correction (RELIABILITY-002, closed
// together with RESILIENCE-001's navigate(".", { replace: true }) fix): the
// pre-correction "Reintentar" test only asserted the same fallback heading
// was present before/after the click, which can't distinguish a working
// retry from a no-op handler. Spying on the real `useNavigate` (mocked here,
// actual module preserved otherwise) lets the test assert the exact
// navigate call the retry mechanism is supposed to make.
const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

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

/**
 * D3.2 (design-fidelity Slice D3): `RouteErrorBoundary` is the root route's
 * `errorElement` (wired in App.tsx's `appRoutes`, not exercised here) — a
 * data-router route that throws during render must still land on the app's
 * own Spanish "Algo salió mal" fallback via `useRouteError`/`useNavigate`,
 * never React Router's own built-in default error page. `createMemoryRouter`
 * is enough to prove this without touching the browser history APIs.
 */
function ThrowingScreen(): never {
  throw new Error("route boom");
}

function renderWithRouteError(children: RouteObject["children"]) {
  const routes: RouteObject[] = [
    {
      errorElement: <RouteErrorBoundary />,
      children,
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    navigateSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the app's own 'Algo salió mal' fallback, not React Router's default error page, when a routed screen throws", () => {
    renderWithRouteError([{ path: "/", element: <ThrowingScreen /> }]);

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();
    // React Router's own unstyled default ("Unexpected Application Error!")
    // must never surface — proves our errorElement actually won.
    expect(
      screen.queryByText(/Unexpected Application Error/i),
    ).not.toBeInTheDocument();
  });

  it("'Reintentar' calls navigate('.', { replace: true }) to re-render the current route in place, not a full reload", async () => {
    const user = userEvent.setup();
    renderWithRouteError([{ path: "/", element: <ThrowingScreen /> }]);

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    // Asserts the exact retry mechanism fired, not just that the same
    // fallback heading is still on screen afterwards (that alone can't tell
    // a working retry apart from a no-op handler). `.` + `replace: true` is
    // the idiomatic react-router way to re-trigger the current route's
    // render without a new history entry or a browser document reload —
    // deliberately NOT `navigate(0)`, which forwards to `history.go(0)` and,
    // for the app's real createBrowserRouter, is an actual full reload.
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(".", { replace: true });
  });
});
