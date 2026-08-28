import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/AccountMenu";

/**
 * Redesign Round 2, Batch 1: Header Pattern (business-owner brief,
 * verbatim): "El título 'Dashboard' debe desaparecer del contenido y pasar
 * al navbar. En Dashboard: O2 Insumos/título a la izquierda y perfil a la
 * derecha. En pantallas secundarias: flecha ← + título en el navbar."
 *
 * Pure chrome/navigation component, no business logic — every screen that
 * used to render its own `<h1>` title now renders `AppHeader` instead.
 * `title` renders as a real `<h1>` for correct heading hierarchy (there is
 * exactly one per screen, same as before).
 */
export interface AppHeaderProps {
  title: string;
  /** @default false */
  showBack?: boolean;
}

export function AppHeader({ title, showBack = false }: AppHeaderProps) {
  const navigate = useNavigate();

  if (showBack) {
    return (
      <header className="flex items-center gap-2 px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Volver"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft aria-hidden="true" className="!size-[22px]" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between px-4 py-2">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <AccountMenu />
    </header>
  );
}
