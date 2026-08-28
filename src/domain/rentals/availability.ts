import { RENTAL_ITEM_TYPES, type RentalItemType } from "@/domain/rentals/rental";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "Concentradores disponibles"/"Tanques disponibles"
 * means REAL availability (total configured stock − currently active
 * rentals of that type), not a static/fixed number. Total stock is two env
 * vars (`VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES`, `vite-env.d.ts`) —
 * same established pattern as `VITE_STALE_RENTAL_DAYS` (Anexo A.3
 * precedent), NOT an inventory module. Pure functions, no I/O, no
 * PocketBase types — mirrors `domain/rentals/dashboard.ts`'s own explicit
 * convention ("no I/O, no PocketBase types") rather than the plan's literal
 * `RentalItemRecord[]` signature: `countActiveQuantityByType` takes a
 * minimal structural shape instead, so this module stays fully decoupled
 * from `data/rentals.repo.ts` (dependency points domain → nothing, not
 * domain → data). `RentalItemRecord` already satisfies this shape
 * structurally, so callers pass it straight through with no adapter.
 * `DashboardScreen` is the only place these get wired to real fetched data.
 */

export interface ActiveRentalItemLike {
  item_type: RentalItemType;
  quantity: number;
}

export function countActiveQuantityByType(
  items: ActiveRentalItemLike[],
): Record<RentalItemType, number> {
  const counts = Object.fromEntries(
    RENTAL_ITEM_TYPES.map((itemType) => [itemType, 0]),
  ) as Record<RentalItemType, number>;

  for (const item of items) {
    counts[item.item_type] += item.quantity;
  }

  return counts;
}

export function availableStock(total: number, activeCount: number): number {
  return Math.max(total - activeCount, 0);
}

// Anexo A.3 precedent's own default was 30 (a threshold can never
// legitimately be 0). Total stock is different: 0 is a real, valid
// "nothing configured yet" state (explicitly confirmed acceptable by the
// business owner when this was flagged) — so unlike
// `staleRentalDaysThreshold`, 0 itself is accepted as a configured value,
// not just the fallback.
export const DEFAULT_TOTAL_STOCK = 0;

// `VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES` are always strings from
// `import.meta.env` — this parses defensively so a missing/invalid env var
// never breaks the Dashboard, falling back to 0 (shown in neutral gray, not
// as an error — see `DashboardStats.tsx`).
export function totalStockFromEnv(envValue: string | undefined): number {
  const parsed = Number(envValue);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_TOTAL_STOCK;
}
