import { Navigate, Route, BrowserRouter, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";
import { LoginScreen } from "@/screens/login/LoginScreen";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { SearchScreen } from "@/screens/search/SearchScreen";

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
        <Route path="/login" element={<LoginScreen />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/nueva-renta" element={<RentalNewScreen />} />
          <Route path="/buscar" element={<SearchScreen />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
