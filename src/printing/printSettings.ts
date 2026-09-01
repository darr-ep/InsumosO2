const AUTO_PRINT_STORAGE_KEY = "o2-insumos:auto-print-enabled";

/**
 * Defaults to `true` (preserve today's day-to-day behavior) whenever
 * nothing is stored yet, or `localStorage` throws (private browsing,
 * unavailable storage) — the safe failure mode is "prints like it always
 * did", not "silently stops printing real rentals".
 */
export function isAutoPrintEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAutoPrintEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_PRINT_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Storage unavailable — the read side already fails open to `true`.
  }
}
