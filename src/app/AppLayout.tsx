import { NavLink, Outlet } from "react-router";
import { LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Redesign Round 2, Batch 3: Bottom Nav Wiring (business-owner brief,
 * verbatim): "No usar la barra inferior actual con Dashboard/Nueva
 * renta/Buscar. Sí quiero una barra inferior mínima con únicamente:
 * Inicio, Clientes. Nueva renta se accede mediante el CTA principal.
 * Buscar se accede mediante el buscador. No agregar más elementos a la
 * navegación primaria." Exactly 2 primary destinations — do not add more.
 */
const TABS = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
] as const;

/**
 * Root chrome for the authenticated area. Redesign Round 2, Batch 1
 * (Header Pattern, business-owner brief): the per-screen title and the
 * account menu both moved into `AppHeader`/`AccountMenu`, composed by each
 * screen itself instead of by this layout.
 *
 * Redesign Round 2, Batch 3 (Bottom Nav Wiring) reintroduces a minimal
 * 2-item bottom nav (Inicio, Clientes) — Nueva renta stays reachable via
 * Dashboard's main CTA, Buscar via the search bar, per the business
 * owner's brief above. Reuses the exact `NavLink`/icon/label/
 * `min-h-[44px]`/active-state pattern from the original pre-redesign
 * 3-tab bar (`git show 127faec~1:src/app/AppLayout.tsx`), trimmed to 2
 * items and swapping `LogOut`/header for `AppHeader`/`AccountMenu`
 * (Batch 1's job, unaffected here).
 *
 * Deliberately NOT `position: fixed` (unlike the old 3-tab bar): `<nav>`
 * is a normal `shrink-0` flex sibling of `<main>` (which is `flex-1
 * overflow-y-auto`), so the nav can never overlap scrollable content —
 * no `pb-20`-style compensating padding hack is needed anywhere. This
 * also sidesteps the well-known iOS Safari `position: fixed` + on-screen
 * -keyboard-jitter bug.
 *
 * The `min-h-dvh flex flex-col` wrapper is kept because `<main>`'s
 * `flex-1 overflow-y-auto` needs a flex/bounded-height ancestor to
 * actually constrain scrolling — removing it would be a real layout
 * regression, not just chrome. `bg-background text-foreground` are
 * redundant with `body`'s own `@layer base` rule (index.css) but kept for
 * clarity/no behavior change.
 *
 * Redesign Round 3, Batch B (visual consistency pass): `mx-auto max-w-xl`
 * on this root — the app had no width cap anywhere, so header/list/nav all
 * stretched edge-to-edge on tablet. `RentalNewScreen.tsx` mirrors this same
 * root treatment since it renders outside this layout (own route, no bottom
 * nav — see `App.tsx`), so both variants of the app shell stay capped the
 * same way instead of one being full-bleed.
 */
export function AppLayout() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-background text-foreground overflow-hidden">
      <main className="flex flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
      <nav
        aria-label="Navegación principal"
        className="flex shrink-0 border-t bg-background py-1.5"
      >
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-medium",
                "min-h-[44px]",
                isActive
                  ? "text-primary font-bold"
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
