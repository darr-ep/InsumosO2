import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
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
 * with no recovery path. Mounted once at the app root (see App.tsx), around
 * `<Routes>`, so it catches a crash in any screen without needing one
 * per-screen (React error boundaries only catch errors from their
 * descendants' render/lifecycle, never their own render, so this can't
 * catch a crash in `App.tsx` itself above it — acceptable, that file is
 * pure routing wiring with no render logic of its own to crash).
 *
 * "Reintentar" resets `hasError` so the crashed subtree gets a fresh
 * render — enough when the crash was caused by transient state (e.g. a
 * bad response shape that a retry/refetch on mount resolves). If the same
 * data is still bad, it fails again immediately, which is why "Recargar
 * página" is offered as a guaranteed-clean fallback (a full reload
 * re-fetches everything from scratch, unlike a boundary reset).
 */
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

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Algo salió mal</h1>
          <p className="text-muted-foreground text-sm">
            Ocurrió un error inesperado. Podés intentar de nuevo o recargar la
            página.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleRetry}>
              Reintentar
            </Button>
            <Button onClick={this.handleReload}>Recargar página</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
