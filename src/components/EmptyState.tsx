import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * design-fidelity Slice C (design obs #2224 §5, task 5): optional `action`
 * slot added for `CustomerDetailSheet`'s "Sin rentas" case (+ Nueva renta
 * CTA) — additive, every other existing consumer (`DashboardScreen`,
 * `ClientesScreen`) keeps rendering with no action button.
 */
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <p className="text-muted-foreground text-sm">{title}</p>
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
      {action && (
        <Button type="button" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
