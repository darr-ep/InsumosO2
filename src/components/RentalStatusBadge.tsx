import { cn } from "@/lib/utils";
import { rentalStatusLabel } from "@/domain/rentals/rental";

/**
 * SDD.md §16.4 ("el estado se comunica primero con texto, el color es
 * refuerzo, no la única señal") + §17. Task 3.3. Always renders the label
 * text — color is a supporting cue, never the only signal.
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
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {rentalStatusLabel(status)}
    </span>
  );
}
