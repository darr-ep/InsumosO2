import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "@/app/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@fontsource-variable/inter";
import "@/index.css";

// Registro y auto-actualización del Service Worker de la PWA
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Revisa si hay nueva versión cada 10 minutos
      setInterval(() => {
        registration.update().catch(() => {});
      }, 10 * 60 * 1000);
      // Revisa si hay nueva versión cada vez que el usuario regresa a la app
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      });
    }
  },
});

/**
 * design-fidelity Slice D3 scoped correction (RESILIENCE-003): the class
 * `ErrorBoundary` wraps `<App/>` here so a throw during `App()`'s own
 * render — including the `useState(() => createBrowserRouter(appRoutes))`
 * router-construction call itself — is still caught. `RouteErrorBoundary`
 * (the router's `errorElement`, wired in `App.tsx`) only exists as a node
 * produced by an already-successfully-constructed router, so it structurally
 * cannot catch an error thrown while building/matching the tree that would
 * render it. This restores the coverage the pre-D3 tree had (the class
 * boundary used to wrap `<Routes>` as a descendant inside `App()`), moved
 * one level up now that `App()`'s own render can itself throw.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
