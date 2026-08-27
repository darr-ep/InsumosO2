import { NavLink, Outlet, useNavigate } from "react-router";
import { LayoutDashboard, LogOut, PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/data/auth.repo";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/nueva-renta", label: "Nueva renta", icon: PlusCircle },
  { to: "/buscar", label: "Buscar", icon: Search },
] as const;

/**
 * Root chrome for the 3 authenticated screens (§16.5, §16.6): a fixed bottom
 * tab bar with exactly 3 destinations. Rental detail, customer file, payment
 * and return are never routes — they're Sheets/Dialogs opened on top of one
 * of these 3 screens (§18), not part of this navigation.
 *
 * §14 "logout manual disponible" — Gap-fill fix (found post-Phase-5): no
 * logout action existed anywhere in the codebase before this. Explicitly
 * navigates to `/login` after clearing the session — App.tsx's own
 * `RequireAuth` guard would redirect there anyway on the next render
 * (`pb.authStore.clear()` fires `onChange`), but doing it here too keeps
 * this chrome correct even if it's ever rendered outside that guard.
 */
export function AppLayout() {
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-end border-b p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cerrar sesión"
          onClick={handleLogout}
        >
          <LogOut aria-hidden="true" className="size-5" />
        </Button>
      </header>
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background"
      >
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium",
                "min-h-[44px]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon aria-hidden="true" className="size-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
