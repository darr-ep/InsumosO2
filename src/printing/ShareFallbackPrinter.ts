import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import type { ReceiptData } from "@/domain/rentals/receipt";

/**
 * SDD.md §21 (impresión falla → reintentar/compartir) + §22 (comprobante,
 * de renta y de devolución) + §23.4 (`ShareFallbackPrinter` — único camino
 * en iPhone, §23.2).
 *
 * This is deliberately standalone, not an implementation of the
 * `ReceiptPrinter` interface (§23.4) — that interface, `WebBluetoothPrinter`
 * and the ESC/POS builders are Phase 5 (hardware printing). This module
 * only needs `navigator.share`, which has nothing to do with Bluetooth.
 */

export type ShareReceiptResult =
  | "shared"
  | "cancelled"
  | "unsupported"
  | "failed";

export function isShareAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  );
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

// Plain-text summary for navigator.share's `text` field — §22's austere
// "comprobante de referencia, no factura fiscal" principle applies here
// too, keep it short. Branches on `receipt.kind` (task 3.2) since a
// devolución comprobante has different content (§22).
export function formatReceiptShareText(receipt: ReceiptData): string {
  if (receipt.kind === "return") {
    const lines = [
      `${receipt.businessName} · ${receipt.businessPhone}`,
      `Folio: ${receipt.folio}`,
      `Cliente: ${receipt.customerName} (${receipt.customerPhone})`,
      `Tiempo rentado: ${receipt.rentedDays} días`,
      `Monto cobrado: ${currencyFormatter.format(receipt.amountCollected)}`,
      `Depósito devuelto: ${currencyFormatter.format(receipt.depositReturned)}`,
    ];

    return lines.join("\n");
  }

  const lines = [
    `${receipt.businessName} · ${receipt.businessPhone}`,
    `Folio: ${receipt.folio}`,
    `Cliente: ${receipt.customerName} (${receipt.customerPhone})`,
    ...receipt.items.map(
      (item) => `${item.quantity} x ${rentalItemTypeLabel(item.itemType)}`,
    ),
    `Renta inicial: ${currencyFormatter.format(receipt.initialRentAmount)}`,
    `Depósito: ${currencyFormatter.format(receipt.depositAmount)}`,
    ...receipt.extras.map(
      (extra) => `${extra.description}: ${currencyFormatter.format(extra.price)}`,
    ),
    `Total: ${currencyFormatter.format(receipt.total)}`,
  ];

  return lines.join("\n");
}

export async function shareReceipt(
  receipt: ReceiptData,
): Promise<ShareReceiptResult> {
  if (!isShareAvailable()) {
    return "unsupported";
  }

  try {
    await navigator.share({
      title:
        receipt.kind === "return"
          ? `Comprobante de devolución ${receipt.folio}`
          : `Comprobante ${receipt.folio}`,
      text: formatReceiptShareText(receipt),
    });
    return "shared";
  } catch (error) {
    // The user closing the native share sheet is not a failure (§21 —
    // sharing is optional/best-effort, never blocking).
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    return "failed";
  }
}
