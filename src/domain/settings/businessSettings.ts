import { z } from "zod";

/**
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced). `total_concentradores`/`total_tanques`
 * used to be build-time-only via `VITE_TOTAL_CONCENTRADORES`/
 * `VITE_TOTAL_TANQUES` (Redesign Round 2, Batch 4) — editing them required a
 * `.env` file edit + a dev-server restart, which the business owner can't do
 * herself. This is explicitly NOT an inventory module (no per-unit
 * tracking, no catalog, no purchase history) — just two numbers, now
 * editable at runtime directly from the Dashboard's availability tiles
 * (`DashboardStats.tsx`'s tap-to-edit dialog).
 *
 * Pure validation only, no I/O — same `zod` + `.safeParse()` convention
 * `domain/payments/payment.ts`'s `paymentFormSchema` already established.
 * Business owner (verbatim): editable "tanto para aumentar como
 * disminuir" — both directions are the exact same schema/code path, no
 * separate +/- controls. The one real constraint: "un negocio no puede
 * tener -3 concentradores" — negative totals are rejected client-side with
 * a clear Spanish message (never silently clamped or ignored).
 */
export const totalStockSchema = z
  .number({ error: "Ingresa un número válido." })
  .int("El total debe ser un número entero.")
  .min(0, "El total no puede ser negativo.");

export type TotalStockValue = z.infer<typeof totalStockSchema>;
