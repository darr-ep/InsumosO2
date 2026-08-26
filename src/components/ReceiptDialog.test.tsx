import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import type { RentalReceiptData } from "@/domain/rentals/receipt";

const shareReceipt = vi.fn();

vi.mock("@/printing/ShareFallbackPrinter", async () => {
  const actual = await vi.importActual<
    typeof import("@/printing/ShareFallbackPrinter")
  >("@/printing/ShareFallbackPrinter");
  return {
    ...actual,
    shareReceipt: (...args: unknown[]) => shareReceipt(...args),
  };
});

const receipt: RentalReceiptData = {
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

describe("ReceiptDialog (§22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    shareReceipt.mockReset();
  });

  it("renders nothing (no dialog content) when there is no receipt", () => {
    render(
      <ReceiptDialog open={false} onOpenChange={vi.fn()} receipt={null} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows folio, customer, items, extras and the computed total", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />,
    );

    expect(
      screen.getByRole("heading", { name: "Comprobante R-000001" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("2 cubrebocas KF94")).toBeInTheDocument();
    expect(screen.getByText("$3,850.00")).toBeInTheDocument();
  });

  it("shows a Compartir button only when navigator.share is available", () => {
    vi.stubGlobal("navigator", {});
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />,
    );

    expect(
      screen.queryByRole("button", { name: "Compartir" }),
    ).not.toBeInTheDocument();
  });

  it("shows a confirmation after a successful share", async () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    shareReceipt.mockResolvedValue("shared");
    const user = userEvent.setup();
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />,
    );

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(
      await screen.findByText("Comprobante compartido."),
    ).toBeInTheDocument();
  });

  it("shows an error message when sharing fails, without closing the dialog", async () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    shareReceipt.mockResolvedValue("failed");
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReceiptDialog open onOpenChange={onOpenChange} receipt={receipt} />,
    );

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(
      await screen.findByText("No se pudo compartir el comprobante."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when Cerrar is pressed", async () => {
    vi.stubGlobal("navigator", {});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReceiptDialog open onOpenChange={onOpenChange} receipt={receipt} />,
    );

    // Two buttons share the accessible name "Cerrar": the explicit footer
    // button and the dialog's own X close control — click the footer one.
    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    await user.click(closeButtons[0]);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
