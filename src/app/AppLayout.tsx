import { NavLink, Outlet } from "react-router";
import { LayoutDashboard, PlusCircle, Search } from "lucide-react";
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
 */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
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
