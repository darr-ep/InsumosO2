import { daysSince } from "@/domain/rentals/dashboard";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import type { RentalItemType } from "@/domain/rentals/rental";

/**
 * SDD.md §22 (generación de comprobantes — contenido de renta y de
 * devolución). Pure assembly of the receipt content — no rendering, no
 * I/O. `ReceiptDialog` (task 1.9, extended task 3.2) is the only consumer
 * that turns this into HTML — reused as-is for both "Nueva renta" and
 * "Devolver" (§16.6: "Comprobante — sobre Nueva renta... y sobre el modal
 * de Devolver"), discriminated by `kind`.
 */

export interface ReceiptItemLine {
  itemType: RentalItemType;
  quantity: number;
}

export interface ReceiptExtraLine {
  description: string;
  price: number;
}

export interface RentalReceiptData {
  kind: "create";
  businessName: string;
  businessPhone: string;
  folio: string;
  date: Date;
  customerName: string;
  customerPhone: string;
  items: ReceiptItemLine[];
  initialRentAmount: number;
  depositAmount: number;
  extras: ReceiptExtraLine[];
  total: number;
}

export interface BuildRentalReceiptInput {
  businessName: string;
  businessPhone: string;
  folio: string;
  date: Date;
  customerName: string;
  customerPhone: string;
  items: ReceiptItemLine[];
  initialRentAmount: number;
  depositAmount: number;
  extras: ReceiptExtraLine[];
}

// §22: "Renta inicial, depósito, Otros (si aplica), total".
export function buildRentalReceipt(
  input: BuildRentalReceiptInput,
): RentalReceiptData {
  const extrasTotal = input.extras.reduce(
    (sum, extra) => sum + extra.price,
    0,
  );

  return {
    kind: "create",
    ...input,
    total: input.initialRentAmount + input.depositAmount + extrasTotal,
  };
}

// §22: "Contenido (devolución): folio, cliente, fecha de inicio y de
// devolución, tiempo rentado, monto cobrado, depósito devuelto."
export interface ReturnReceiptData {
  kind: "return";
  businessName: string;
  businessPhone: string;
  folio: string;
  customerName: string;
  customerPhone: string;
  startedAt: Date;
  returnedAt: Date;
  rentedDays: number;
  amountCollected: number;
  depositReturned: number;
}

export interface BuildReturnReceiptInput {
  businessName: string;
  businessPhone: string;
  folio: string;
  customerName: string;
  customerPhone: string;
  startedAt: Date;
  returnedAt: Date;
  amountCollected: number;
  depositReturned: number;
}

export function buildReturnReceipt(
  input: BuildReturnReceiptInput,
): ReturnReceiptData {
  return {
    kind: "return",
    ...input,
    rentedDays: daysSince(input.startedAt, input.returnedAt),
  };
}

// Discriminated union: `ReceiptDialog` (task 1.9/3.2) is one shared modal
// for both flows, per §16.6.
export type ReceiptData = RentalReceiptData | ReturnReceiptData;

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

/**
 * Plain-text line-by-line rendering of a receipt (§22's austere
 * "comprobante de referencia, no factura fiscal" principle). Shared by
 * `ShareFallbackPrinter.formatReceiptShareText` (joins with `\n` for
 * `navigator.share`) and `WebBluetoothPrinter.print` (task 5.3, feeds
 * each line to `buildTicket`) — extracted here (task 5.3 refactor) so the
 * receipt content itself has exactly one source of truth, independent of
 * which printer backend renders it.
 */
export function formatReceiptLines(receipt: ReceiptData): string[] {
  if (receipt.kind === "return") {
    return [
      `${receipt.businessName} · ${receipt.businessPhone}`,
      `Folio: ${receipt.folio}`,
      `Cliente: ${receipt.customerName} (${receipt.customerPhone})`,
      `Tiempo rentado: ${receipt.rentedDays} días`,
      `Monto cobrado: ${currencyFormatter.format(receipt.amountCollected)}`,
      `Depósito devuelto: ${currencyFormatter.format(receipt.depositReturned)}`,
    ];
  }

  return [
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
}
