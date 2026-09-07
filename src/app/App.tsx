import { useEffect, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/app/AppLayout";
import { DataCacheProvider } from "@/app/DataCacheContext";
import { useIsAuthenticated } from "@/app/useIsAuthenticated";
import { LoginScreen } from "@/screens/login/LoginScreen";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { ClientesScreen } from "@/screens/clientes/ClientesScreen";
import { ProfileScreen } from "@/screens/profile/ProfileScreen";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import { useApplyTheme } from "@/lib/theme";

/**
 * SDD.md §14 — Gap-fill fix (found post-Phase-5): `App.tsx` had zero auth
 * check before this. Gates the 3 authenticated routes behind
 * `pb.authStore.isValid` (via `useIsAuthenticated`, §14's "sesión
 * persistente" already backs this with zero extra wiring) — an
 * unauthenticated visitor is redirected to `/login`. Reacts LIVE to
 * `pb.authStore.onChange` (login/logout), no full page reload needed.
 *
 * Also the single mount point for `webBluetoothPrinter.startAutoReconnect()`
 * — it wraps every authenticated route as their common ancestor and stays
 * mounted across in-app navigation (only its `<Outlet>` content swaps), so
 * the background retry loop starts once per session instead of resetting on
 * every screen change. `AppLayout`/`PrinterMenu` remount more often and
 * would spam/reset the loop if it lived there instead.
 * `startAutoReconnect()`'s own idempotency guard makes this safe even if
 * this effect re-fires (e.g. React StrictMode).
 */
function RequireAuth() {
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (isAuthenticated) {
      webBluetoothPrinter.startAutoReconnect();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DataCacheProvider>
      <Outlet />
    </DataCacheProvider>
  );
}

/**
 * §14/§16.6: don't show the login picker to a visitor with a live session —
 * redirect straight to the authenticated area instead.
 */
function LoginRoute() {
  const isAuthenticated = useIsAuthenticated();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginScreen />;
}

/**
 * Redesign nav batch (business-owner brief, round 2): the authenticated
 * area is no longer a fixed 3-tab bar — Dashboard is the hub, reached
 * directly after login, with Nueva renta one tap away (a button on
 * Dashboard). `/buscar` is gone — its behavior is folded into Dashboard's
 * own search bar (DashboardScreen, redesign nav batch). Rental detail,
 * customer file, payment and return remain Sheets/Dialogs on top of these,
 * never routes of their own.
 *
 * Redesign Round 3, punto 6: `/historial` route removed — `searchRentals`
 * already searches over every rental regardless of status and the customer
 * file already shows its own history, so a separate history screen was
 * fully redundant.
 *
 * Redesign Round 2, Batch 3 (Bottom Nav Wiring): `AppLayout` reintroduces
 * a minimal, non-fixed 2-item bottom nav (Inicio, Clientes only — see
 * `AppLayout.tsx`'s own docblock). Nueva renta and Buscar are deliberately
 * NOT nav items — reached via Dashboard's CTA and search bar respectively,
 * per the business owner's explicit brief for this batch.
 */
/**
 * design-fidelity Slice D3: route tree migrated from `<BrowserRouter>` +
 * `<Routes>`/`<Route>` (JSX-declared, no `useBlocker` support) to
 * `createBrowserRouter`/`RouterProvider` (a data router). The ONLY reason
 * for this migration is that Phase D1 (Nueva renta exit-guard, a later
 * slice) needs `useBlocker`, which only data routers expose — no route
 * path changes, no guard semantics changes, no screen behavior changes.
 *
 * Exported (not just used internally) so `App.test.tsx` and any other
 * consumer can exercise the exact same tree directly if needed. Matches
 * the pre-D3 tree 1:1: same pathless `RequireAuth`/`AppLayout` layout
 * routes, same 4 leaf routes, same root `/` and `*` redirects to
 * `/dashboard`. The one addition is `errorElement: <RouteErrorBoundary />`
 * on the pathless root — a data router needs an explicit `errorElement` to
 * show the app's own "Algo salió mal" fallback instead of React Router's
 * built-in default error page (see `ErrorBoundary.tsx`'s docblock).
 */
// eslint-disable-next-line react-refresh/only-export-components -- design-fidelity Slice D3: appRoutes is exported alongside App on purpose (App.test.tsx and any future consumer needs the exact same route tree, not a duplicate); not worth a separate file for one array.
export const appRoutes: RouteObject[] = [
  {
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/login", element: <LoginRoute /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "/dashboard", element: <DashboardScreen /> },
              { path: "/clientes", element: <ClientesScreen /> },
            ],
          },
          { path: "/nueva-renta", element: <RentalNewScreen /> },
          { path: "/perfil", element: <ProfileScreen /> },
        ],
      },
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

/**
 * SDD.md §16.13/§17 (gap-fill finding 4): a single `<Toaster />` mounted
 * once here so it survives route changes — §17's "Toast/Sonner para
 * confirmaciones breves (pago registrado, comprobante compartido)".
 * Individual screens/dialogs call `toast.success(...)` from `sonner`
 * directly; this is the only place the container itself mounts.
 *
 * design-fidelity Slice D3: moved from inside `<BrowserRouter>` (but
 * outside `<Routes>`) to a sibling of `<RouterProvider>` — same "mounted
 * once, survives route changes" property, just expressed as a JSX sibling
 * instead of a JSX ancestor now that there's no `<BrowserRouter>` wrapper
 * to nest it inside.
 *
 * The router itself is built in `useState`'s lazy initializer, NOT at
 * module scope — a module-scope `createBrowserRouter(appRoutes)` call
 * would snapshot `window.location` at import time, before any test's
 * `window.history.pushState(...)` setup runs, breaking every test that
 * relies on rendering `<App/>` at a specific initial route (`App.test.tsx`
 * pushes state before `render(<App/>)` in ~7 cases). `useState(() => ...)`
 * defers construction to first render, by which point the pushState call
 * has already happened.
 */
export function App() {
  useApplyTheme();
  const [router] = useState(() => createBrowserRouter(appRoutes));

  return (
    <>
      <Toaster />
      <RouterProvider router={router} />
    </>
  );
}
