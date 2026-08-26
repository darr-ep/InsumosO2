import { describe, expect, it } from "vitest";
import { buildRentalReceipt } from "@/domain/rentals/receipt";

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
