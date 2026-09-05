import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useNavigate, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Prod-readiness gap-fill: the app had zero error boundaries anywhere — a
 * render crash left a non-technical business owner on a blank white screen
 * with no recovery path.
 *
 * design-fidelity Slice D3 (router migration to `createBrowserRouter`):
 * this file now exports two things instead of one crash-recovery surface.
 *
 * - `ErrorFallback` is the plain presentational markup, extracted so both
 *   boundaries below render byte-identical UI.
 * - `ErrorBoundary` (the class) is UNCHANGED in behavior/public API — still
 *   usable anywhere as a plain React error boundary around arbitrary
 *   children — it just delegates its markup to `ErrorFallback` now.
 * - `RouteErrorBoundary` is new: it's a route-level `errorElement` (wired as
 *   the root route's `errorElement` in `App.tsx`'s `appRoutes`), which is
 *   how React Router's data routers (`createBrowserRouter`) surface a
 *   render/loader/action throw instead of their own unstyled default error
 *   page. It is NOT nested inside the class `ErrorBoundary` — it replaces
 *   it at the route-tree root, since a data router's `errorElement` already
 *   subsumes what wrapping every route in `<ErrorBoundary>` would do.
 *
 * Semantic drift from the pre-D3 shape (previously this doc said the class
 * boundary sat "around `<Routes>`", which stopped being true once the route
 * tree moved to `appRoutes`/`RouterProvider`): the class's own "Reintentar"
 * resets `hasError` in place (same component tree, same location, freshly
 * re-rendered children) — useful wherever `ErrorBoundary` is still used
 * directly around a non-routed subtree. The route version's "Reintentar"
 * instead calls `navigate(".", { replace: true })`, which re-triggers the
 * CURRENT route's render (re-invoking its loader/element) rather than
 * resetting local component state, because a route `errorElement` swaps out
 * the entire crashed route's subtree — there is no parent boundary instance
 * with `hasError` state to reset. Both land the user on a fresh render of
 * the crashed screen; only the underlying recovery mechanism differs.
 *
 * design-fidelity Slice D3 scoped correction (RESILIENCE-001): the retry was
 * originally wired to `navigate(0)`, which forwards to `history.go(0)` —
 * for the app's real `createBrowserRouter` this is `window.history.go(0)`,
 * i.e. an actual full document reload, making "Reintentar" and "Recargar
 * página" do the identical expensive thing and defeating the point of having
 * two separate recovery actions. `navigate(".", { replace: true })` is
 * react-router's idiomatic way to re-render the current route in place
 * without touching browser history or reloading the document.
 */
export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <h1 className="text-lg font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground text-sm">
        Ocurrió un error inesperado. Podés intentar de nuevo o recargar la
        página.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
        <Button onClick={() => window.location.reload()}>
          Recargar página
        </Button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught a render error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

/**
 * See this file's docblock above for the full rationale. `useRouteError()`
 * is only called for logging here (mirrors the class's own
 * `componentDidCatch` logging) — the actual error value/shape isn't
 * rendered, same "Algo salió mal" generic copy either way.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  console.error("RouteErrorBoundary caught a route error:", error);

  return <ErrorFallback onRetry={() => navigate(".", { replace: true })} />;
}
