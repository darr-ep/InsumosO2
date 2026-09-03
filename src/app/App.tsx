import { useEffect } from "react";
import { Navigate, Outlet, Route, BrowserRouter, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/app/AppLayout";
import { DataCacheProvider } from "@/app/DataCacheContext";
import { useIsAuthenticated } from "@/app/useIsAuthenticated";
import { LoginScreen } from "@/screens/login/LoginScreen";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { ClientesScreen } from "@/screens/clientes/ClientesScreen";
import { ProfileScreen } from "@/screens/profile/ProfileScreen";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";

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
 * SDD.md §16.13/§17 (gap-fill finding 4): a single `<Toaster />` mounted
 * once here, outside `<Routes>` so it survives route changes — §17's
 * "Toast/Sonner para confirmaciones breves (pago registrado, comprobante
 * compartido)". Individual screens/dialogs call `toast.success(...)` from
 * `sonner` directly; this is the only place the container itself mounts.
 */
export function App() {
  return (
    <BrowserRouter>
      <Toaster />
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardScreen />} />
              <Route path="/clientes" element={<ClientesScreen />} />
            </Route>
            <Route path="/nueva-renta" element={<RentalNewScreen />} />
            <Route path="/perfil" element={<ProfileScreen />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
