import { ClipboardList } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardStatsProps {
  activeRentalsCount: number;
  isRefreshing?: boolean;
}

export function DashboardStats({
  activeRentalsCount,
  isRefreshing = false,
}: DashboardStatsProps) {
  return (
    <div
      role="group"
      aria-label={`Rentas activas: ${activeRentalsCount}`}
      className="bg-card w-full flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 shadow-xs"
    >
      <div className="flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <ClipboardList
            aria-hidden="true"
            data-testid="stat-icon-rentas-activas"
            className="size-6"
          />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-semibold text-foreground">
            Rentas activas
          </span>
          <span className="text-xs text-muted-foreground">
            Equipos actualmente en renta
          </span>
        </div>
      </div>

      <div className="flex items-center">
        {isRefreshing ? (
          <Skeleton className="h-7 w-8 rounded-md" />
        ) : (
          <span className="text-xl font-bold tracking-tight text-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
            {activeRentalsCount}
          </span>
        )}
      </div>
    </div>
  );
}
