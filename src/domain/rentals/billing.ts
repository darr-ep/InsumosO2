/**
 * Reglas de periodicidad mensual y cálculo de cortes / vencimientos.
 *
 * Si una renta inició el 1 de enero, el corte es el 1 de cada mes.
 * Si inició el día 31 (ej. 31 de marzo), en abril corta el 30, en febrero el 28 (o 29 en bisiesto).
 */

/**
 * Obtiene el último día de un mes específico (ej. febrero 2026 -> 28).
 */
export function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Calcula la fecha de corte N meses después de la fecha de inicio,
 * respetando el día del mes original o acotándolo al último día del mes destino si este tiene menos días.
 *
 * @param startDate Fecha en que inició la renta
 * @param monthsToAdd Número de meses/periodos a sumar
 */
export function addMonthsAnchored(startDate: Date, monthsToAdd: number): Date {
  const originalYear = startDate.getUTCFullYear();
  const originalMonth = startDate.getUTCMonth();
  const originalDay = startDate.getUTCDate();
  const hours = startDate.getUTCHours();
  const minutes = startDate.getUTCMinutes();
  const seconds = startDate.getUTCSeconds();
  const ms = startDate.getUTCMilliseconds();

  const targetTotalMonths = originalMonth + monthsToAdd;
  const targetYear = originalYear + Math.floor(targetTotalMonths / 12);
  const targetMonth = ((targetTotalMonths % 12) + 12) % 12;

  const maxDaysInTargetMonth = getLastDayOfMonth(targetYear, targetMonth);
  const targetDay = Math.min(originalDay, maxDaysInTargetMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, targetDay, hours, minutes, seconds, ms),
  );
}

/**
 * Determina si una renta activa requiere revisión basándose en los periodos cubiertos.
 *
 * Al iniciar la renta, el "Pago Inicial" cubre el primer mes (hasta `addMonthsAnchored(startedAt, 1)`).
 * Cada pago subsecuente de tipo 'rent' cubre 1 mes adicional.
 * Si la fecha actual `now` es mayor o igual a la fecha de vencimiento del periodo cubierto,
 * la renta requiere revisión.
 *
 * @param startedAt Fecha de inicio de la renta
 * @param rentPaymentsCount Cantidad de pagos de renta registrados (excluyendo el inicial de creación si este ya se cuenta por defecto, o contabilizando los periodos cubiertos)
 * @param now Fecha actual
 */
export function getRentalNextDueDate(
  startedAt: Date,
  periodsCovered: number = 1,
): Date {
  // Aseguramos al menos 1 periodo cubierto por el pago inicial
  const effectivePeriods = Math.max(1, periodsCovered);
  return addMonthsAnchored(startedAt, effectivePeriods);
}

/**
 * Retorna true si la renta ya venció y requiere revisión / cobro.
 */
export function isRentalDue(
  startedAt: Date,
  periodsCovered: number = 1,
  now: Date = new Date(),
): boolean {
  const nextDueDate = getRentalNextDueDate(startedAt, periodsCovered);
  return now.getTime() >= nextDueDate.getTime();
}
