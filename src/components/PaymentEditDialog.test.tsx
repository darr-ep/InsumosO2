import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { PaymentEditDialog } from "@/components/PaymentEditDialog";
import type { PaymentWithUser } from "@/data/rentals.repo";

const updatePayment = vi.fn();
const deletePayment = vi.fn();

vi.mock("@/data/payments.repo", () => ({
  updatePayment: (...args: unknown[]) => updatePayment(...args),
  deletePayment: (...args: unknown[]) => deletePayment(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("PaymentEditDialog", () => {
  const mockPayment: PaymentWithUser = {
    id: "p1",
    rental_id: "r1",
    amount: 3000,
    payment_type: "rent",
    note: "Nota original",
    created: "2026-08-29T10:00:00.000Z",
    created_by: "u1",
    collectionId: "payments",
    collectionName: "payments",
    updated: "2026-08-29T10:00:00.000Z",
  };

  beforeEach(() => {
    updatePayment.mockReset();
    deletePayment.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("pre-fills amount and note and updates on submit", async () => {
    updatePayment.mockResolvedValueOnce({ ...mockPayment, amount: 3500, note: "Nota nueva" });
    const onPaymentUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentEditDialog
        open
        onOpenChange={onOpenChange}
        payment={mockPayment}
        customerName="Juan Pérez"
        onPaymentUpdated={onPaymentUpdated}
      />,
    );

    const amountInput = screen.getByLabelText("Monto");
    expect(amountInput).toHaveValue("$ 3,000");

    const noteInput = screen.getByLabelText(/Nota/i);
    expect(noteInput).toHaveValue("Nota original");

    await user.clear(amountInput);
    await user.type(amountInput, "3500");
    await user.clear(noteInput);
    await user.type(noteInput, "Nota nueva");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith("p1", {
      amount: 3500,
      note: "Nota nueva",
    }));
    expect(toast.success).toHaveBeenCalledWith("Pago actualizado correctamente");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPaymentUpdated).toHaveBeenCalled();
  });

  it("shows error if amount is 0 or empty", async () => {
    const user = userEvent.setup();

    render(
      <PaymentEditDialog
        open
        onOpenChange={() => {}}
        payment={mockPayment}
      />,
    );

    const amountInput = screen.getByLabelText("Monto");
    await user.clear(amountInput);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El monto debe ser mayor a 0.")).toBeInTheDocument();
    expect(updatePayment).not.toHaveBeenCalled();
  });

  it("opens confirm dialog when Eliminar pago is tapped and deletes upon confirmation", async () => {
    deletePayment.mockResolvedValueOnce(undefined);
    const onPaymentDeleted = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentEditDialog
        open
        onOpenChange={onOpenChange}
        payment={mockPayment}
        onPaymentDeleted={onPaymentDeleted}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Eliminar pago/i }));

    expect(screen.getByRole("heading", { name: "¿Eliminar este pago?" })).toBeInTheDocument();
    expect(deletePayment).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sí, eliminar pago" }));

    await waitFor(() => expect(deletePayment).toHaveBeenCalledWith("p1"));
    expect(toast.success).toHaveBeenCalledWith("Pago eliminado correctamente");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPaymentDeleted).toHaveBeenCalledWith("p1");
  });
});
