import type { RentalItemType } from "@/domain/rentals/rental";

/**
 * SDD.md §22 (generación de comprobantes — contenido de renta). Pure
 * assembly of the receipt content — no rendering, no I/O. `ReceiptDialog`
 * (task 1.9) is the only consumer that turns this into HTML.
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
    ...input,
    total: input.initialRentAmount + input.depositAmount + extrasTotal,
  };
}
