import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("keeps Imprimir before Compartir before Continuar in DOM order, even laid out side by side (§C5)", async () => {
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
    expect(buttons).toEqual(["Imprimir", "Compartir", "Continuar"]);
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

    await screen.findByRole("heading", { name: "Renta creada" });

    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compartir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).toBeInTheDocument();
  });

  // design-fidelity post-audit bugfix batch, Fix 2 (pencil frame `fcBBX`
  // `DialogoRentaCreada`) — locks the corrected visual mapping so a future
  // regression can't silently drift back toward the pre-fix markup.
  describe("design-fidelity bugfix batch, Fix 2 (pencil frame fcBBX)", () => {
    beforeEach(() => {
      vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
      vi.stubGlobal("navigator", {});
    });

    it("renders the title as neutral-dark text with a SEPARATE circular check badge, not an inline checkmark glyph", async () => {
      render(
        <RentalCreatedSummary
          open
          onOpenChange={vi.fn()}
          receipt={receipt}
          onContinue={vi.fn()}
        />,
      );

      const title = await screen.findByRole("heading", { name: "Renta creada" });
      // The checkmark is its own element (an icon inside a sibling badge
      // div), never concatenated into the title's own text content.
      expect(title).toHaveTextContent("Renta creada");
      expect(title.textContent).not.toMatch(/✓|check/i);
      expect(title).not.toHaveClass("text-success");

      const badge = document.querySelector(".bg-success-soft");
      expect(badge).not.toBeNull();
      expect(badge).not.toBe(title);
      expect(badge?.querySelector("svg")).not.toBeNull();
    });

    it("shows the print-failure message as an amber banner with a triangle-alert icon, with the exact corrected copy (no 'correctamente')", async () => {
      // `useReceiptActions` only reaches `printStatus === "failed"` once a
      // print attempt actually fails — force `handlePrint()`'s
      // `webBluetoothPrinter.connect()` call to reject.
      vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
      vi.mocked(webBluetoothPrinter.connect).mockRejectedValue(
        new Error("no device"),
      );
      const user = userEvent.setup();

      render(
        <RentalCreatedSummary
          open
          onOpenChange={vi.fn()}
          receipt={receipt}
          onContinue={vi.fn()}
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Imprimir" }));

      const message = await screen.findByText(
        "La renta se guardó, pero no se pudo imprimir el comprobante.",
      );
      expect(message.textContent).not.toContain("correctamente");

      const banner = message.closest(".bg-amber-100");
      expect(banner).not.toBeNull();
      expect(banner).toHaveClass("text-amber-700");
      expect(banner?.querySelector("svg")).not.toBeNull();
    });

    it("labels the share button 'Compartir', not 'Compartir comprobante'", async () => {
      vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
      vi.stubGlobal("navigator", { share: vi.fn() });

      render(
        <RentalCreatedSummary
          open
          onOpenChange={vi.fn()}
          receipt={receipt}
          onContinue={vi.fn()}
        />,
      );

      expect(
        await screen.findByRole("button", { name: "Compartir" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Compartir comprobante" }),
      ).not.toBeInTheDocument();
    });

    it("renders Imprimir and Compartir with identical variant/classes (both gray secondary, no outline)", async () => {
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

      const printButton = await screen.findByRole("button", {
        name: "Imprimir",
      });
      const shareButton = screen.getByRole("button", { name: "Compartir" });
      const printClasses = printButton.className.split(" ");
      const shareClasses = shareButton.className.split(" ");

      // `bg-secondary` is the `secondary` variant's own marker class; `border`
      // and `bg-card` are unique to `outline` (Button's base string also
      // contains substrings like "aria-invalid:border-destructive", so the
      // check is against exact tokens, not a substring match).
      expect(printClasses).toContain("bg-secondary");
      expect(shareClasses).toContain("bg-secondary");
      expect(printClasses).not.toContain("border");
      expect(shareClasses).not.toContain("border");
      expect(printClasses).not.toContain("bg-card");
      expect(shareClasses).not.toContain("bg-card");
    });
  });
});
