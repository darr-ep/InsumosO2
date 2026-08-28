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
 */

export interface RentalStatusBadgeProps {
  status: "ACTIVE" | "RETURNED";
}

export function RentalStatusBadge({ status }: RentalStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "ACTIVE"
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {rentalStatusLabel(status)}
    </span>
  );
}
