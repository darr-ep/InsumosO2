/**
 * SDD.md §16.3/§16.4/§16.6 (Dashboard — "requiere revisión") + Anexo A.3
 * (umbral configurable, `VITE_STALE_RENTAL_DAYS`, default 30). Pure rules
 * over a rental's `created` (= `started_at`, §11) — no I/O, no PocketBase
 * types, so `DashboardScreen` (task 2.5) is the only place these get wired
 * to real data.
 */

import { isRentalDue } from "./billing";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Anexo A.3: "variable de entorno fija (VITE_STALE_RENTAL_DAYS), default 30
// días."
export const DEFAULT_STALE_RENTAL_DAYS = 30;

export function daysSince(startedAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - startedAt.getTime()) / MS_PER_DAY);
}

/**
 * Evalúa si una renta requiere revisión considerando el corte mensual
 * y los pagos cubiertos, o por umbral de días.
 *
 * Si se proporcionan `periodsCovered`, utiliza la lógica de corte mensual:
 * si la fecha actual alcanza o supera la fecha de corte, requiere revisión.
 *
 * @param startedAt Fecha de inicio de la renta
 * @param thresholdDays O número de periodos cubiertos si se provee
 * @param now Fecha actual
 * @param periodsCovered Cantidad de periodos/meses cubiertos por pagos
 */
export function isStaleRental(
  startedAt: Date,
  thresholdDays: number,
  now: Date = new Date(),
  periodsCovered?: number,
): boolean {
  if (typeof periodsCovered === "number") {
    return isRentalDue(startedAt, periodsCovered, now);
  }
  return daysSince(startedAt, now) > thresholdDays;
}

// `VITE_STALE_RENTAL_DAYS` is always a string from `import.meta.env` — this
// parses it defensively so a missing/invalid env var never breaks the
// Dashboard, falling back to the SDD-documented default instead.
export function staleRentalDaysThreshold(envValue: string | undefined): number {
  const parsed = Number(envValue);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_STALE_RENTAL_DAYS;
}
