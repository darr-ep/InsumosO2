import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReturnDialog } from "@/components/ReturnDialog";

const returnRental = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  returnRental: (...args: unknown[]) => returnRental(...args),
}));

// Gap-fill finding 4 (§16.13/§17): ReturnDialog gave zero success
// confirmation before this — mocked here so these tests can assert the
// exact toast call without a real (visually-timed) Sonner render.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  rentalId: "rental1",
  businessName: "Insumos O2",
  businessPhone: "771 131 3535",
  folio: "R-000001",
  customerName: "Juan Pérez",
  customerPhone: "5512345678",
  items: [{ itemType: "concentrator" as const, quantity: 1 }],
  startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  depositAmount: 1000,
  suggestedAmount: 2800,
  hasPreviousRentPayment: false,
};

describe("ReturnDialog (§7.3, §16.8, CU6, task 3.2)", () => {
  afterEach(() => {
    returnRental.mockReset();
    baseProps.onOpenChange.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("shows cliente, productos, fecha de inicio, tiempo transcurrido and depósito, with editable suggested amounts (CU6 first scenario)", () => {
    render(<ReturnDialog {...baseProps} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("5 días")).toBeInTheDocument();
    expect(screen.getByLabelText(/monto cobrado/i)).toHaveValue(2800);
    expect(screen.getByLabelText("Depósito a devolver")).toHaveValue(1000);
  });

  it("calls returnRental with the (possibly edited) amounts and builds a return receipt on confirm (CU6 second/third scenarios)", async () => {
    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const onReturned = vi.fn();
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} onReturned={onReturned} />);

    const amountInput = screen.getByLabelText(/monto cobrado/i);
    await user.clear(amountInput);
    await user.type(amountInput, "5000");

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(returnRental).toHaveBeenCalledWith({
      rentalId: "rental1",
      amountCollected: 5000,
      depositReturned: 1000,
      note: undefined,
    });
    expect(onReturned).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "return",
        folio: "R-000001",
        amountCollected: 5000,
        depositReturned: 1000,
      }),
    );
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("fires a success toast when the return is registered (§16.13/§17, gap-fill finding 4)", async () => {
    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Devolución registrada.");
  });

  it("does NOT fire a success toast when the return fails to save (§16.13/§17, gap-fill finding 4)", async () => {
    returnRental.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    await screen.findByText(
      "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rejects a negative amount without calling returnRental", async () => {
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    const amountInput = screen.getByLabelText(/monto cobrado/i);
    await user.clear(amountInput);
    await user.type(amountInput, "-100");

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    expect(
      await screen.findByText("El monto cobrado no puede ser negativo."),
    ).toBeInTheDocument();
    expect(returnRental).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the dialog open when the return call fails (§21)", async () => {
    returnRental.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    expect(
      await screen.findByText(
        "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(baseProps.onOpenChange).not.toHaveBeenCalled();
  });

  it("shows a Guardando… loading label on the confirm button while submitting, reverting after success (§16.13)", async () => {
    let resolveReturnRental: (value: {
      id: string;
      returned_at: string;
    }) => void = () => {};
    returnRental.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReturnRental = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();

    resolveReturnRental({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });

    expect(
      await screen.findByRole("button", { name: "Confirmar devolución" }),
    ).toBeInTheDocument();
  });
});
