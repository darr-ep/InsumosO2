import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import type { RentalReceiptData, ReturnReceiptData } from "@/domain/rentals/receipt";

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

// SDD.md §23.2/§23.4/CU8 (task 5.4). WebBluetoothPrinter itself is fully
// covered in WebBluetoothPrinter.test.ts (task 5.3) — here we only verify
// ReceiptDialog's orchestration: show/hide the button based on
// `isAvailable()`, the Bluetooth-first → failure-message → retry/share
// flow (§21), and that a print failure never touches `onOpenChange`
// (the rental stays saved regardless of print outcome).
vi.mock("@/printing/WebBluetoothPrinter", () => ({
  webBluetoothPrinter: {
    isAvailable: vi.fn(),
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

describe("ReceiptDialog (§22)", () => {
  beforeEach(() => {
    // Sensible default for tests that don't care about Bluetooth printing
    // — most existing tests predate task 5.4 and stub `navigator` without
    // `bluetooth` anyway; tests that DO exercise the print flow override
    // this explicitly.
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    shareReceipt.mockReset();
    vi.mocked(webBluetoothPrinter.isAvailable).mockReset();
    vi.mocked(webBluetoothPrinter.connect).mockReset();
    vi.mocked(webBluetoothPrinter.print).mockReset();
    vi.mocked(webBluetoothPrinter.disconnect).mockReset();
  });

  it("renders nothing (no dialog content) when there is no receipt", () => {
    render(
      <ReceiptDialog open={false} onOpenChange={vi.fn()} receipt={null} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows folio, customer, items and the computed total", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />,
    );

    expect(
      screen.getByRole("heading", { name: "Comprobante R-000001" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("$3,800.00")).toBeInTheDocument();
  });

  it("renders the business logo at the top of the receipt (§22 — nombre del negocio + logo + teléfono)", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />,
    );

    const logo = screen.getByRole("img", { name: "Insumos O2" });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/logo.png");
  });

  it("also renders the business logo for a devolución receipt (§22, task 3.2's shared modal)", () => {
    vi.stubGlobal("navigator", {});
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={returnReceipt} />,
    );

    expect(
      screen.getByRole("img", { name: "Insumos O2" }),
    ).toBeInTheDocument();
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

    const confirmation = await screen.findByText("Comprobante compartido.");
    expect(confirmation).toBeInTheDocument();
    // Redesign Batch F: this is the confirmation point of the primary
    // "Nueva renta → Registrar → Comprobante" flow — uses the `--success`
    // token (registered by Batch E, first real consumer here) instead of
    // neutral `text-muted-foreground`, same "un-consumed token → real
    // consumer" pattern Batch D established for `--warning`.
    expect(confirmation).toHaveClass("text-success");
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

  it("shows folio, tiempo rentado, monto cobrado and depósito devuelto for a devolución receipt (task 3.2)", () => {
    vi.stubGlobal("navigator", {});
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={returnReceipt} />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Comprobante de devolución R-000001",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("31 días")).toBeInTheDocument();
    expect(screen.getByText("$2,800.00")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
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

describe("ReceiptDialog Bluetooth printing (§23.2/§23.3/§23.4, CU8, task 5.4)", () => {
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

  it("does not show an Imprimir button when Bluetooth printing isn't available (CU8 — e.g. iPhone)", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(false);
    vi.stubGlobal("navigator", {});
    render(<ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />);

    await screen.findByRole("heading", { name: "Comprobante R-000001" });
    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
  });

  it("shows an Imprimir button when Bluetooth printing is available", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.stubGlobal("navigator", {});
    render(<ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />);

    expect(
      await screen.findByRole("button", { name: "Imprimir" }),
    ).toBeInTheDocument();
  });

  it("connects and prints via Bluetooth, showing a confirmation on success (CU8 scenario 1)", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.mocked(webBluetoothPrinter.connect).mockResolvedValue(undefined);
    vi.mocked(webBluetoothPrinter.print).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {});
    const user = userEvent.setup();
    render(<ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />);

    await user.click(await screen.findByRole("button", { name: "Imprimir" }));

    const confirmation = await screen.findByText("Comprobante impreso.");
    expect(confirmation).toBeInTheDocument();
    // Redesign Batch F: same `--success`-token treatment as the share
    // confirmation above — a printed receipt is the same "important action"
    // confirmation point.
    expect(confirmation).toHaveClass("text-success");
    expect(webBluetoothPrinter.connect).toHaveBeenCalled();
    expect(webBluetoothPrinter.print).toHaveBeenCalledWith(receipt);
  });

  it("shows the exact §21 failure message and a retry button when printing fails, without closing the dialog (CU8 scenario 3)", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.mocked(webBluetoothPrinter.connect).mockRejectedValue(
      new Error("No se encontró ninguna impresora."),
    );
    vi.stubGlobal("navigator", {});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReceiptDialog open onOpenChange={onOpenChange} receipt={receipt} />,
    );

    await user.click(await screen.findByRole("button", { name: "Imprimir" }));

    expect(
      await screen.findByText(
        "La renta se guardó correctamente, pero no se pudo imprimir el comprobante.",
      ),
    ).toBeInTheDocument();
    // Failed print still just reads "Imprimir" — no separate "reintentar"
    // wording (post-launch polish, normalized with RentalCreatedSummary).
    expect(
      screen.getByRole("button", { name: "Imprimir" }),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("can succeed on retry after a failed print attempt (triangulation)", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.mocked(webBluetoothPrinter.connect)
      .mockRejectedValueOnce(new Error("busy"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(webBluetoothPrinter.print).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {});
    const user = userEvent.setup();
    render(<ReceiptDialog open onOpenChange={vi.fn()} receipt={receipt} />);

    await user.click(await screen.findByRole("button", { name: "Imprimir" }));
    await screen.findByText(
      "La renta se guardó correctamente, pero no se pudo imprimir el comprobante.",
    );

    await user.click(screen.getByRole("button", { name: "Imprimir" }));

    expect(await screen.findByText("Comprobante impreso.")).toBeInTheDocument();
  });

  it("also offers Bluetooth printing for a devolución receipt", async () => {
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
    vi.mocked(webBluetoothPrinter.connect).mockResolvedValue(undefined);
    vi.mocked(webBluetoothPrinter.print).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {});
    const user = userEvent.setup();
    render(
      <ReceiptDialog open onOpenChange={vi.fn()} receipt={returnReceipt} />,
    );

    await user.click(await screen.findByRole("button", { name: "Imprimir" }));

    expect(await screen.findByText("Comprobante impreso.")).toBeInTheDocument();
    expect(webBluetoothPrinter.print).toHaveBeenCalledWith(returnReceipt);
  });
});
