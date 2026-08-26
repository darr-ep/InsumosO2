import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatReceiptShareText,
  isShareAvailable,
  shareReceipt,
} from "@/printing/ShareFallbackPrinter";
import type { RentalReceiptData, ReturnReceiptData } from "@/domain/rentals/receipt";

const receipt: RentalReceiptData = {
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
  extras: [{ description: "2 cubrebocas KF94", price: 50 }],
  total: 3850,
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

describe("formatReceiptShareText (§22)", () => {
  it("includes the business, folio, customer, items and total", () => {
    const text = formatReceiptShareText(receipt);

    expect(text).toContain("Insumos O2");
    expect(text).toContain("Folio: R-000001");
    expect(text).toContain("Juan Pérez");
    expect(text).toContain("1 x Concentrador");
    expect(text).toContain("2 cubrebocas KF94");
    expect(text).toMatch(/Total: \$3,850\.00/);
  });

  it("includes rented days, amount collected and deposit returned for a devolución receipt (task 3.2)", () => {
    const text = formatReceiptShareText(returnReceipt);

    expect(text).toContain("Folio: R-000001");
    expect(text).toContain("Tiempo rentado: 31 días");
    expect(text).toMatch(/Monto cobrado: \$2,800\.00/);
    expect(text).toMatch(/Depósito devuelto: \$1,000\.00/);
  });
});

describe("shareReceipt (§21, §23.2/§23.4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when navigator.share does not exist (e.g. desktop without support)", async () => {
    vi.stubGlobal("navigator", {});

    expect(isShareAvailable()).toBe(false);
    expect(await shareReceipt(receipt)).toBe("unsupported");
  });

  it("reports shared when navigator.share resolves", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    expect(await shareReceipt(receipt)).toBe("shared");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprobante R-000001" }),
    );
  });

  it("reports cancelled when the user dismisses the native share sheet", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    vi.stubGlobal("navigator", { share });

    expect(await shareReceipt(receipt)).toBe("cancelled");
  });

  it("reports failed for any other share error", async () => {
    const share = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("navigator", { share });

    expect(await shareReceipt(receipt)).toBe("failed");
  });

  it("uses a 'Comprobante de devolución' title for a return receipt (task 3.2)", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    expect(await shareReceipt(returnReceipt)).toBe("shared");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Comprobante de devolución R-000001",
      }),
    );
  });
});
