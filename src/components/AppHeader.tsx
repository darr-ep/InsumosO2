import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/AccountMenu";
import { PrinterMenu } from "@/components/PrinterMenu";
import { cn } from "@/lib/utils";

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
  titleClassName?: string;
}

export function AppHeader({
  title,
  showBack = false,
  titleClassName,
}: AppHeaderProps) {
  const navigate = useNavigate();

  if (showBack) {
    return (
      <header className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Volver"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft aria-hidden="true" className="!size-[22px]" />
          </Button>
          <h1
            className={cn(
              "text-2xl font-bold tracking-tight",
              titleClassName,
            )}
          >
            {title}
          </h1>
        </div>
        <PrinterMenu />
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between px-4 py-2">
      <h1
        className={cn(
          "text-2xl font-bold tracking-tight",
          (title === "Insumos O2" ||
            title === import.meta.env.VITE_BUSINESS_NAME) &&
            "text-primary",
          titleClassName,
        )}
      >
        {title}
      </h1>
      <div className="flex items-center gap-1">
        <PrinterMenu />
        <AccountMenu />
      </div>
    </header>
  );
}
