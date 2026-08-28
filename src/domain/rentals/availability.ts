import { RENTAL_ITEM_TYPES, type RentalItemType } from "@/domain/rentals/rental";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "Concentradores disponibles"/"Tanques disponibles"
 * means REAL availability (total configured stock − currently active
 * rentals of that type), not a static/fixed number. Pure functions, no I/O,
 * no PocketBase types — mirrors `domain/rentals/dashboard.ts`'s own explicit
 * convention ("no I/O, no PocketBase types") rather than the plan's literal
 * `RentalItemRecord[]` signature: `countActiveQuantityByType` takes a
 * minimal structural shape instead, so this module stays fully decoupled
 * from `data/rentals.repo.ts` (dependency points domain → nothing, not
 * domain → data). `RentalItemRecord` already satisfies this shape
 * structurally, so callers pass it straight through with no adapter.
 * `DashboardScreen` is the only place these get wired to real fetched data.
 *
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced): total stock used to be two build-time
 * env vars (`VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES`), same fixed-
 * env-var pattern as `VITE_STALE_RENTAL_DAYS` (Anexo A.3 precedent) — the
 * business owner needs to change these numbers herself, at runtime, without
 * editing a file or restarting the server. `totalStockFromEnv`/
 * `DEFAULT_TOTAL_STOCK` (env-var parsing + its "not configured yet"
 * fallback) are REMOVED — the durable value now lives in PocketBase's new
 * `business_settings` singleton collection (`pb_migrations/
 * *_business_settings_collection.js`, `src/data/settings.repo.ts`) and is
 * fetched by `DashboardScreen`, which passes the real
 * `total_concentradores`/`total_tanques` straight into `availableStock`
 * below — that function itself is unchanged, only where `total` comes from
 * changed.
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
