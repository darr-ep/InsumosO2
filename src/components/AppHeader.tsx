import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/AccountMenu";
import { PrinterMenu } from "@/components/PrinterMenu";
import { ThemeMenu } from "@/components/ThemeMenu";
import { cn } from "@/lib/utils";

/**
 * design-fidelity bugfix batch, Fix 1: the pencil design only puts the
 * printer trigger on the non-`showBack` (Dashboard/Clientes) header — every
 * `showBack` screen (Nueva renta wizard, Perfil, etc.) never had it in the
 * design. It was previously rendered unconditionally in both branches.
 */

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
 *
 * Post-launch polish: the `showBack` (secondary-screen, "Nueva renta"/
 * "Perfil") title is deliberately `text-xl`, one step down from the
 * `text-2xl` the Inicio/Clientes variant keeps — a size pass on secondary
 * screens over-applied to Inicio/Clientes too the first time; reverted
 * there specifically, the `showBack` size stays.
 */
export interface AppHeaderProps {
  title: string;
  /** @default false */
  showBack?: boolean;
  onBack?: () => void;
  titleClassName?: string;
}

export function AppHeader({
  title,
  showBack = false,
  onBack,
  titleClassName,
}: AppHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  if (showBack) {
    return (
      <header className="bg-card flex items-center justify-between border-b px-2 py-2.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Volver"
            onClick={handleBack}
            className="rounded-full"
          >
            <ArrowLeft aria-hidden="true" className="!size-[24px]" />
          </Button>
          <h1
            className={cn(
              "text-lg font-semibold tracking-tight",
              titleClassName,
            )}
          >
            {title}
          </h1>
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between pl-4 pr-2 py-2">
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
        <ThemeMenu />
        <PrinterMenu />
        <AccountMenu />
      </div>
    </header>
  );
}
