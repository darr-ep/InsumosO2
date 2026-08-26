import { describe, expect, it } from "vitest";
import { buildRentalReceipt, buildReturnReceipt } from "@/domain/rentals/receipt";

describe("buildRentalReceipt (§22)", () => {
  it("totals initial rent + deposit + extras", () => {
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
      extras: [{ description: "2 cubrebocas KF94", price: 50 }],
    });

    expect(receipt.total).toBe(3850);
    expect(receipt.kind).toBe("create");
  });

  it("totals correctly with no extras", () => {
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
      extras: [],
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
