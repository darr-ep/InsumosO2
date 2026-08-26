import { daysSince } from "@/domain/rentals/dashboard";
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
