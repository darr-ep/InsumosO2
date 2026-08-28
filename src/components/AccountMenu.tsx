import { Link, useNavigate } from "react-router";
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
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief) —
 * extracted verbatim out of `AppLayout` so `AppHeader`'s home variant can
 * compose it into the header (title left, account menu right). Same
 * trigger, same two items (Historial, Cerrar sesión), same `logout()` call
 * and navigation as before this extraction — zero behavior change, just
 * relocated so it's independently reusable/testable.
 *
 * §14 "logout manual disponible" — Gap-fill fix (found post-Phase-5): no
 * logout action existed anywhere in the codebase before that. Explicitly
 * navigates to `/login` after clearing the session — App.tsx's own
 * `RequireAuth` guard would redirect there anyway on the next render
 * (`pb.authStore.clear()` fires `onChange`), but doing it here too keeps
 * this chrome correct even if it's ever rendered outside that guard.
 */
export function AccountMenu() {
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Cuenta">
          <UserRound aria-hidden="true" className="!size-[22px]" />
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
  );
}
