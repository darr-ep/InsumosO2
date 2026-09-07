import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentCreatedSummary } from "@/components/PaymentCreatedSummary";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { PaymentReceiptData } from "@/domain/rentals/receipt";

/**
 * design-fidelity ("Éxito · Pago registrado" / "Éxito · Ajuste registrado")
 * — mirrors RentalCreatedSummary.test.tsx's mocking/DOM-order conventions,
 * since this component drives the same `useReceiptActions` hook directly.
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

const paymentReceipt: PaymentReceiptData = {
  kind: "payment",
  businessName: "Insumos O2",
  businessPhone: "771 131 3535",
  folio: "R-000002",
  customerName: "Bicho",
  customerPhone: "775 156 7242",
  paymentType: "rent",
  amount: 2800,
  date: new Date("2026-08-29T10:00:00Z"),
};

const adjustmentReceipt: PaymentReceiptData = {
  ...paymentReceipt,
  paymentType: "adjustment",
  amount: 300,
  note: "Regulador dañado",
};

describe("PaymentCreatedSummary (design-fidelity: Éxito · Pago/Ajuste registrado)", () => {
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

  it("renders the payment title/folio/amount-row label with a separate check badge", async () => {
    vi.stubGlobal("navigator", {});

    render(
      <PaymentCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={paymentReceipt}
        onContinue={vi.fn()}
      />,
    );

    const title = await screen.findByRole("heading", { name: "Pago registrado" });
    expect(title.textContent).not.toMatch(/✓|check/i);
    const badge = document.querySelector(".bg-success-soft");
    expect(badge).not.toBeNull();
    expect(badge?.querySelector("svg")).not.toBeNull();

    expect(screen.getByText("Folio R-000002")).toBeInTheDocument();
    expect(screen.getByText("Pago")).toBeInTheDocument();
    expect(screen.getByText("$2,800.00")).toBeInTheDocument();
    expect(screen.queryByText("Nota")).not.toBeInTheDocument();
  });

  it("renders the adjustment title, 'Monto ajustado' label, and the conditional Nota row", async () => {
    vi.stubGlobal("navigator", {});

    render(
      <PaymentCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={adjustmentReceipt}
        onContinue={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Ajuste registrado" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Monto ajustado")).toBeInTheDocument();
    expect(screen.getByText("$300.00")).toBeInTheDocument();
    expect(screen.getByText("Nota")).toBeInTheDocument();
    expect(screen.getByText("Regulador dañado")).toBeInTheDocument();
  });

  it("keeps Imprimir before Compartir before Aceptar in DOM order", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.stubGlobal("navigator", { share: vi.fn() });

    render(
      <PaymentCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={paymentReceipt}
        onContinue={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: "Imprimir" });

    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((text) => text !== "Cerrar");
    expect(buttons).toEqual(["Imprimir", "Compartir", "Aceptar"]);
  });

  it("hides the print/share row entirely when neither printing nor sharing is available", async () => {
    vi.stubGlobal("navigator", {});

    render(
      <PaymentCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={paymentReceipt}
        onContinue={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Pago registrado" });

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

  it("shows the print-failure message as an amber banner, worded per paymentType", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.mocked(webBluetoothPrinter.connect).mockRejectedValue(
      new Error("no device"),
    );
    const user = userEvent.setup();

    render(
      <PaymentCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={adjustmentReceipt}
        onContinue={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Imprimir" }));

    const message = await screen.findByText(
      "El ajuste se guardó, pero no se pudo imprimir el comprobante.",
    );
    const banner = message.closest(".bg-warning-soft");
    expect(banner).not.toBeNull();
    expect(banner).toHaveClass("text-warning-soft-foreground");
    expect(banner?.querySelector("svg")).not.toBeNull();
  });

  it("calls onContinue when Aceptar is tapped", async () => {
    vi.stubGlobal("navigator", {});
    const onContinue = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentCreatedSummary
        open
        onOpenChange={vi.fn()}
        receipt={paymentReceipt}
        onContinue={onContinue}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Aceptar" }),
    );
    expect(onContinue).toHaveBeenCalled();
  });
});
