import { Link, Outlet, useNavigate } from "react-router";
import { History, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/data/auth.repo";

/**
 * Root chrome for the authenticated area. Redesign nav batch
 * (business-owner brief, round 2) replaced the old fixed bottom 3-tab bar
 * (Dashboard/Nueva renta/Buscar) entirely: "remove the current 3-tab bottom
 * bar" (round 1) plus "El Dashboard debe ser el centro de la aplicación...
 * sin una barra inferior con demasiadas opciones" (round 2). Dashboard is
 * now the sole hub — Nueva renta is reached from a button on Dashboard
 * itself, Buscar is folded into Dashboard's own search bar, and Detalle de
 * renta/pago/devolución/comprobante/selección de cliente/credencial all
 * stay Sheets/Dialogs, never routes (unchanged from before this batch).
 *
 * The only secondary navigation left, per the brief, is "el acceso al
 * usuario/cerrar sesión y, si resulta necesario, acceso al historial" — one
 * account `DropdownMenu` trigger in the header with exactly those two
 * items.
 *
 * §14 "logout manual disponible" — Gap-fill fix (found post-Phase-5): no
 * logout action existed anywhere in the codebase before that. Explicitly
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Cuenta">
              <UserRound aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/historial">
                <History aria-hidden="true" />
                Historial
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut aria-hidden="true" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
