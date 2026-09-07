import { useState } from "react";
import { useNavigate } from "react-router";
import { LogOut, UserPen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { logout } from "@/data/auth.repo";

/**
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief) —
 * extracted verbatim out of `AppLayout` so `AppHeader`'s home variant can
 * compose it into the header (title left, account menu right).
 *
 * Redesign Round 3, punto 6: se quitó el ítem "Historial" — el buscador del
 * Dashboard (`searchRentals`) ya busca sobre todas las rentas sin filtrar
 * por status, y la ficha de cliente ya muestra su historial completo, así
 * que la ruta separada era 100% redundante con eso.
 *
 * §14 "logout manual disponible" — Gap-fill fix (found post-Phase-5): no
 * logout action existed anywhere in the codebase before that. Explicitly
 * navigates to `/login` after clearing the session — App.tsx's own
 * `RequireAuth` guard would redirect there anyway on the next render
 * (`pb.authStore.clear()` fires `onChange`), but doing it here too keeps
 * this chrome correct even if it's ever rendered outside that guard.
 *
 * New gap-fill feature: Self-Service Profile Screen (business owner
 * request, post-Phase-5) — "Perfil" added above "Cerrar sesión", the entry
 * point to `ProfileScreen` (`/perfil`).
 *
 * design-fidelity (Slice B1, obs #2221/#2223/#2224, call site #4): logging
 * out clears the PocketBase session and needs a password re-typed to get
 * back in — sits one dropdown row below "Perfil", a classic mis-tap. Gated
 * unconditionally behind the shared `ConfirmDialog`, rendered as a JSX
 * SIBLING of `DropdownMenu` (design B3 nesting pattern).
 */
export function AccountMenu() {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openConfirm() {
    setConfirmOpen(true);
  }

  function handleConfirmLogout() {
    setConfirmOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cuenta"
            className="rounded-full"
          >
            <UserRound aria-hidden="true" className="!size-[24px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate("/perfil")}>
            <UserPen aria-hidden="true" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openConfirm}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Cerrar sesión?"
        description="Tendrás que volver a escribir tu contraseña para entrar de nuevo."
        confirmLabel="Sí, salir"
        onConfirm={handleConfirmLogout}
      />
    </>
  );
}
