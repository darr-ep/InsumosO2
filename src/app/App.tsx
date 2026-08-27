import { Navigate, Outlet, Route, BrowserRouter, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";
import { useIsAuthenticated } from "@/app/useIsAuthenticated";
import { LoginScreen } from "@/screens/login/LoginScreen";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { SearchScreen } from "@/screens/search/SearchScreen";

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
 * Only 3 real routes behind the tab bar (Dashboard / Nueva renta / Buscar)
 * plus `/login` (§16.5, §18). Rental detail, customer file, payment and
 * return are Sheets/Dialogs on top of these, never routes of their own —
 * they land alongside the screens that open them in later phases.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/nueva-renta" element={<RentalNewScreen />} />
            <Route path="/buscar" element={<SearchScreen />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
