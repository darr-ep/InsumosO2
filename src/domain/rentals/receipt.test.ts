import { describe, expect, it } from "vitest";
import {
  buildRentalReceipt,
  buildReturnReceipt,
  formatReceiptLines,
} from "@/domain/rentals/receipt";
import type { RentalReceiptData, ReturnReceiptData } from "@/domain/rentals/receipt";

describe("buildRentalReceipt (§22)", () => {
  it("totals initial rent + deposit", () => {
    const receipt = buildRentalReceipt({
      businessName: "Insumos O2",
      businessPhone: "771 131 3535",
      folio: "R-000001",
      date: new Date("2026-08-26T10:00:00Z"),
      customerName: "Juan Pérez",
      customerPhone: "5512345678",
      items: [{ itemType: "concentrator", quantity: 1 }],
      initialRentAmount: 2800,
      depositAmount: 1000,
    });

    expect(receipt.total).toBe(3800);
    expect(receipt.kind).toBe("create");
  });

  it("totals correctly with a zero deposit", () => {
    const receipt = buildRentalReceipt({
      businessName: "Insumos O2",
      businessPhone: "771 131 3535",
      folio: "R-000002",
      date: new Date("2026-08-26T10:00:00Z"),
      customerName: "Juan Pérez",
      customerPhone: "5512345678",
      items: [{ itemType: "tank", quantity: 1 }],
      initialRentAmount: 1500,
      depositAmount: 0,
    });

    expect(receipt.total).toBe(1500);
  });
});

describe("buildReturnReceipt (§22, CU6, task 3.2)", () => {
  it("computes rentedDays between started_at and returned_at and marks kind: return", () => {
    const receipt = buildReturnReceipt({
      businessName: "Insumos O2",
      businessPhone: "771 131 3535",
      folio: "R-000001",
      customerName: "Juan Pérez",
      customerPhone: "5512345678",
      startedAt: new Date("2026-07-01T10:00:00Z"),
      returnedAt: new Date("2026-08-01T10:00:00Z"),
      amountCollected: 2800,
      depositReturned: 1000,
    });

    expect(receipt.kind).toBe("return");
    expect(receipt.rentedDays).toBe(31);
    expect(receipt.amountCollected).toBe(2800);
    expect(receipt.depositReturned).toBe(1000);
  });
});

describe("formatReceiptLines (§22 — shared by ShareFallbackPrinter and WebBluetoothPrinter, task 5.3)", () => {
  const rentalReceipt: RentalReceiptData = {
    kind: "create",
    businessName: "Insumos O2",
    businessPhone: "771 131 3535",
    folio: "R-000001",
    date: new Date("2026-08-26T10:00:00Z"),
    customerName: "Juan Pérez",
    customerPhone: "5512345678",
    items: [{ itemType: "concentrator", quantity: 1 }],
    initialRentAmount: 2800,
    depositAmount: 1000,
    total: 3800,
  };

  const returnReceipt: ReturnReceiptData = {
    kind: "return",
    businessName: "Insumos O2",
    businessPhone: "771 131 3535",
    folio: "R-000001",
    customerName: "Juan Pérez",
    customerPhone: "5512345678",
    startedAt: new Date("2026-07-01T10:00:00Z"),
    returnedAt: new Date("2026-08-01T10:00:00Z"),
    rentedDays: 31,
    amountCollected: 2800,
    depositReturned: 1000,
  };

  it("includes business, folio, customer, items and total for a rental receipt", () => {
    const lines = formatReceiptLines(rentalReceipt);

    expect(lines).toContain("Insumos O2 · 771 131 3535");
    expect(lines).toContain("Folio: R-000001");
    expect(lines).toContain("Cliente: Juan Pérez (5512345678)");
    expect(lines).toContain("1 x Concentrador");
    expect(lines).toContain("Renta inicial: $2,800.00");
    expect(lines).toContain("Depósito: $1,000.00");
    expect(lines).toContain("Total: $3,800.00");
  });

  it("includes rented days, amount collected and deposit returned for a return receipt (triangulation)", () => {
    const lines = formatReceiptLines(returnReceipt);

    expect(lines).toContain("Folio: R-000001");
    expect(lines).toContain("Cliente: Juan Pérez (5512345678)");
    expect(lines).toContain("Tiempo rentado: 31 días");
    expect(lines).toContain("Monto cobrado: $2,800.00");
    expect(lines).toContain("Depósito devuelto: $1,000.00");
    // A rental receipt's item/total lines must NOT leak into a return
    // receipt's lines — proves the branch is real, not a shared template.
    expect(lines.some((line) => line.startsWith("Total:"))).toBe(false);
  });
});
