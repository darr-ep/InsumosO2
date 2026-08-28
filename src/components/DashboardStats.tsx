import { cn } from "@/lib/utils";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "Después: estadísticas compactas: Rentas activas,
 * Concentradores disponibles y Tanques disponibles. Los valores 0 deben
 * mostrarse en gris neutro, no como error."
 *
 * Styling rule (explicit business-owner requirement, already decided):
 * - `0` renders `text-muted-foreground` — zero is a normal/expected state,
 *   not an error.
 * - The two availability tiles (Concentradores/Tanques disponibles): a
 *   non-zero value uses the `--success` token (green) — "hay stock
 *   disponible" reads as a positive state, same `--success`-token pattern
 *   `ReceiptDialog`/Batch D already established for confirmations.
 * - "Rentas activas" is a neutral operational count, not a positive/
 *   negative state — it stays `text-foreground` regardless of value, never
 *   promoted to `--success` or demoted to `text-muted-foreground`.
 *
 * Each tile is `role="group"` with an `aria-label` combining its label and
 * value, so the value (a bare number, otherwise ambiguous when multiple
 * tiles share the same digit) is unambiguously identifiable both to
 * assistive tech and to tests.
 */

export interface DashboardStatsProps {
  activeRentalsCount: number;
  concentradoresDisponibles: number;
  tanquesDisponibles: number;
}

function availabilityValueClassName(value: number): string {
  return value === 0 ? "text-muted-foreground" : "text-success";
}

export function DashboardStats({
  activeRentalsCount,
  concentradoresDisponibles,
  tanquesDisponibles,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div
        role="group"
        aria-label={`Rentas activas: ${activeRentalsCount}`}
        className="flex flex-col items-center gap-1 rounded-md border p-3"
      >
        <span className="text-foreground text-2xl font-semibold">
          {activeRentalsCount}
        </span>
        <span className="text-center text-xs text-muted-foreground">
          Rentas activas
        </span>
      </div>

      <div
        role="group"
        aria-label={`Concentradores disponibles: ${concentradoresDisponibles}`}
        className="flex flex-col items-center gap-1 rounded-md border p-3"
      >
        <span
          className={cn(
            "text-2xl font-semibold",
            availabilityValueClassName(concentradoresDisponibles),
          )}
        >
          {concentradoresDisponibles}
        </span>
        <span className="text-center text-xs text-muted-foreground">
          Concentradores disponibles
        </span>
      </div>

      <div
        role="group"
        aria-label={`Tanques disponibles: ${tanquesDisponibles}`}
        className="flex flex-col items-center gap-1 rounded-md border p-3"
      >
        <span
          className={cn(
            "text-2xl font-semibold",
            availabilityValueClassName(tanquesDisponibles),
          )}
        >
          {tanquesDisponibles}
        </span>
        <span className="text-center text-xs text-muted-foreground">
          Tanques disponibles
        </span>
      </div>
    </div>
  );
}
