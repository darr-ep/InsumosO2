import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RentalCreatedSummary } from "@/components/RentalCreatedSummary";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { RentalReceiptData } from "@/domain/rentals/receipt";

/**
 * Gap-fill for RELIABILITY-001 (design-fidelity Slice C review): the
 * print/share footer restructuring in commit aa95b04 — the `printAvailable
 * && <Button/>` / `shareAvailable && <Button/>` pair moved into a shared
 * `(printAvailable || shareAvailable) && <div className="flex flex-row
 * gap-2">` wrapper, with the primary "Continuar" action kept as its own
 * full-width row last in DOM order — had no test coverage anywhere. Mirrors
 * PrintShareBar.test.tsx's DOM-order guard and ReceiptDialog.test.tsx's
 * WebBluetoothPrinter/navigator.share mocking conventions, since
 * RentalCreatedSummary drives the same `useReceiptActions` hook directly
 * rather than going through `PrintShareBar`.
 */
vi.mock("@/printing/WebBluetoothPrinter", () => ({
  webBluetoothPrinter: {
    isAvailable: vi.fn(),
    isConnected: false,
    connect: vi.fn(),
    print: vi.fn(),
    disconnect: vi.fn(),
  },
}));

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
  total: 3800,
};

describe("RentalCreatedSummary print/share footer (design-fidelity Slice C, RELIABILITY-001)", () => {
  beforeEach(() => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(webBluetoothPrinter.isAvailable).mockReset();
    vi.mocked(webBluetoothPrinter.connect).mockReset();
    vi.mocked(webBluetoothPrinter.print).mockReset();
    vi.mocked(webBluetoothPrinter.disconnect).mockReset();
  });

  it("keeps Imprimir before Compartir comprobante before Continuar in DOM order, even laid out side by side (§C5)", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.stubGlobal("navigator", { share: vi.fn() });

    render(
      <RentalCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={receipt}
        onContinue={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: "Imprimir" });

    // `DialogContent` renders its own "Cerrar" (X) close control ahead of
    // the footer content (same as ReceiptDialog.test.tsx) — that control
    // isn't part of the print/share footer under test, so it's excluded
    // from the DOM-order assertion below.
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((text) => text !== "Cerrar");
    expect(buttons).toEqual(["Imprimir", "Compartir comprobante", "Continuar"]);
  });

  it("hides the print/share row entirely when neither printing nor sharing is available", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
    vi.stubGlobal("navigator", {});

    render(
      <RentalCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={receipt}
        onContinue={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Renta creada ✓" });

    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compartir comprobante" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).toBeInTheDocument();
  });
});
