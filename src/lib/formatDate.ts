const SHORT_MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

/**
 * Formats a date as `dia/mes (texto Ene, Feb...)/año`, e.g. `29/Ago/2026`.
 */
export function formatDateDisplay(
  dateInput: Date | string | number | null | undefined,
): string {
  if (!dateInput) return "—";
  const date =
    typeof dateInput === "string" || typeof dateInput === "number"
      ? new Date(dateInput)
      : dateInput;

  if (isNaN(date.getTime())) return "—";

  const day = date.getDate();
  const month = SHORT_MONTHS_ES[date.getMonth()];
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formats a date and time for timeline/history, e.g. `29/Ago/2026 · 2:41 PM`.
 */
export function formatDateTimeDisplay(
  dateInput: Date | string | number | null | undefined,
): string {
  if (!dateInput) return "—";
  const date =
    typeof dateInput === "string" || typeof dateInput === "number"
      ? new Date(dateInput)
      : dateInput;

  if (isNaN(date.getTime())) return "—";

  const datePart = formatDateDisplay(date);
  const timePart = date.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart} · ${timePart}`;
}
