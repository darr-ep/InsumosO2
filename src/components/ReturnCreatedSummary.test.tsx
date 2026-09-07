import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReturnCreatedSummary } from "@/components/ReturnCreatedSummary";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { ReturnReceiptData } from "@/domain/rentals/receipt";

/**
 * Gap-fill for RELIABILITY-001 (design-fidelity Slice C review): the
 * print/share footer restructuring in commit aa95b04 — the `printAvailable
 * && <Button/>` / `shareAvailable && <Button/>` pair moved into a shared
 * `(printAvailable || shareAvailable) && <div className="flex flex-row
 * gap-2">` wrapper, with the primary "Volver al inicio" action kept as its
 * own full-width row last in DOM order — had no test coverage anywhere.
 * Mirrors PrintShareBar.test.tsx's DOM-order guard and
 * ReceiptDialog.test.tsx's WebBluetoothPrinter/navigator.share mocking
 * conventions, since ReturnCreatedSummary drives the same
 * `useReceiptActions` hook directly rather than going through
 * `PrintShareBar`.
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

describe("ReturnCreatedSummary print/share footer (design-fidelity Slice C, RELIABILITY-001)", () => {
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

  it("keeps Imprimir before Compartir comprobante before Volver al inicio in DOM order, even laid out side by side (§C5)", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.stubGlobal("navigator", { share: vi.fn() });

    render(
      <ReturnCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={returnReceipt}
        onGoHome={vi.fn()}
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
    expect(buttons).toEqual([
      "Imprimir",
      "Compartir",
      "Aceptar",
    ]);
  });

  it("hides the print/share row entirely when neither printing nor sharing is available", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
    vi.stubGlobal("navigator", {});

    render(
      <ReturnCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={returnReceipt}
        onGoHome={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Devolución registrada" });

    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compartir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aceptar" }),
    ).toBeInTheDocument();
  });
});
