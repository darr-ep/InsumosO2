import { cn } from "@/lib/utils";
import { rentalStatusLabel } from "@/domain/rentals/rental";

/**
 * SDD.md §16.4 ("el estado se comunica primero con texto, el color es
 * refuerzo, no la única señal") + §17. Task 3.3. Always renders the label
 * text — color is a supporting cue, never the only signal.
 *
 * Redesign Round 2, Batch 5 (Color Increase Pass): the business owner's
 * color legend is explicit — "Azul: acciones primarias. Verde: estados
 * positivos." An ACTIVE rental is an ongoing STATE, not an action, so it
 * must use the `--success` token, not `--primary` (which is reserved for
 * actual primary actions — buttons/links). Fixed from `bg-primary/10
 * text-primary` to `bg-success/10 text-success`, matching this exact
 * `bg-{token}/10 text-{token}` badge/pill pattern the stale-rentals banner
 * (`DashboardScreen.tsx`) already established for `--warning`. RETURNED
 * stays muted/neutral — a closed-out state correctly carries no color.
 *
 * design-fidelity Slice C (§4.1, design obs #2224 §C3): restyled onto the
 * designer's exact "Activa" pill — `--success-soft` fill (a dedicated
 * token, not the `/10` opacity trick above) with a small leading dot,
 * `text-[11px]/500`. This is purely a visual restyle: the "text first,
 * color as reinforcement" property (the label always renders) is
 * unchanged, and RETURNED keeps its neutral/no-dot treatment.
 */

export interface RentalStatusBadgeProps {
  status: "ACTIVE" | "RETURNED";
  bordered?: boolean;
  className?: string;
}

export function RentalStatusBadge({
  status,
  bordered = false,
  className,
}: RentalStatusBadgeProps) {
  const isActive = status === "ACTIVE";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-[9px] py-[6px] text-[11px] font-medium",
        isActive
          ? cn("bg-success-soft text-success", bordered && "border border-emerald-300")
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {isActive && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
      )}
      {rentalStatusLabel(status)}
    </span>
  );
}
