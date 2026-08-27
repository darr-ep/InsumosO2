import { Navigate, Outlet, Route, BrowserRouter, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/app/AppLayout";
import { useIsAuthenticated } from "@/app/useIsAuthenticated";
import { LoginScreen } from "@/screens/login/LoginScreen";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { SearchScreen } from "@/screens/search/SearchScreen";
import { HistorialScreen } from "@/screens/historial/HistorialScreen";

/**
 * SDD.md §14 — Gap-fill fix (found post-Phase-5): `App.tsx` had zero auth
 * check before this. Gates the 3 authenticated routes behind
 * `pb.authStore.isValid` (via `useIsAuthenticated`, §14's "sesión
 * persistente" already backs this with zero extra wiring) — an
 * unauthenticated visitor is redirected to `/login`. Reacts LIVE to
 * `pb.authStore.onChange` (login/logout), no full page reload needed.
 */
function RequireAuth() {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
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
 * directly after login, with Nueva renta and Historial one tap away
 * (a button on Dashboard, and the header's account menu, respectively).
 * `/buscar` stays temporarily until the next batch folds its behavior into
 * Dashboard's own search bar. Rental detail, customer file, payment and
 * return remain Sheets/Dialogs on top of these, never routes of their own.
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
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/nueva-renta" element={<RentalNewScreen />} />
            <Route path="/buscar" element={<SearchScreen />} />
            <Route path="/historial" element={<HistorialScreen />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
