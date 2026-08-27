import type { ReceiptData } from "@/domain/rentals/receipt";

/**
 * SDD.md §23.4 — shared contract for a receipt printer backend (task 5.1).
 * `WebBluetoothPrinter` (task 5.3) is the concrete implementation for the
 * WW-POS58U thermal printer. `ShareFallbackPrinter` predates this interface
 * (Phase 1/3) and stays a standalone function module on purpose — sharing
 * via `navigator.share` has no connection lifecycle, so `connect()`/
 * `disconnect()` don't map to it. `ReceiptDialog` (task 5.4) is the only
 * consumer that needs both: it tries the Bluetooth path first (when
 * `isAvailable()` resolves `true`) and falls back to
 * `ShareFallbackPrinter.shareReceipt` on any failure (§21's "impresión
 * falla → reintentar/compartir").
 */
export interface ReceiptPrinter {
  /**
   * Whether this printer backend can even be attempted on the current
   * browser/device (e.g. Web Bluetooth support + secure context). Must
   * never throw — a backend that can't be used just resolves `false`, so
   * callers can fall back gracefully instead of crashing or hanging on
   * unsupported browsers (iOS Safari, §23.2).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Establishes (or reuses, if already connected in this tab session —
   * §23.3) the connection needed before `print()`. May prompt the
   * browser's native device picker the first time.
   */
  connect(): Promise<void>;

  /** Prints the given receipt. Requires a prior successful `connect()`. */
  print(receipt: ReceiptData): Promise<void>;

  /** Releases the connection, if any. Safe to call when not connected. */
  disconnect(): Promise<void>;
}
