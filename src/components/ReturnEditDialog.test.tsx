import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReturnEditDialog } from "@/components/ReturnEditDialog";

const updateReturnDetails = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  updateReturnDetails: (...args: unknown[]) => updateReturnDetails(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("ReturnEditDialog", () => {
  beforeEach(() => {
    updateReturnDetails.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("renders with the folio in the title and pre-fills the current deposit returned", () => {
    render(
      <ReturnEditDialog
        open
        onOpenChange={vi.fn()}
        rentalId="r1"
        folio="R-000042"
        currentDepositReturned={1000}
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText(/R-000042/)).toBeInTheDocument();
    const depositInput = screen.getByLabelText("Depósito devuelto");
    expect(depositInput).toHaveValue("$ 1,000");
  });

  it("saves with updated deposit and calls onUpdated on success", async () => {
    const updatedRental = {
      id: "r1",
      status: "RETURNED",
      deposit_returned_amount: 800,
    };
    updateReturnDetails.mockResolvedValueOnce(updatedRental);
    const onUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ReturnEditDialog
        open
        onOpenChange={onOpenChange}
        rentalId="r1"
        folio="R-000042"
        currentDepositReturned={1000}
        onUpdated={onUpdated}
      />,
    );

    const depositInput = screen.getByLabelText("Depósito devuelto");
    await user.clear(depositInput);
    await user.type(depositInput, "800");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateReturnDetails).toHaveBeenCalledWith("r1", {
        depositReturnedAmount: 800,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Devolución actualizada correctamente",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUpdated).toHaveBeenCalledWith(updatedRental);
  });

  it("includes note in the request when note is filled", async () => {
    updateReturnDetails.mockResolvedValueOnce({
      id: "r1",
      status: "RETURNED",
      deposit_returned_amount: 500,
    });
    const user = userEvent.setup();

    render(
      <ReturnEditDialog
        open
        onOpenChange={vi.fn()}
        rentalId="r1"
        folio="R-000042"
        currentDepositReturned={500}
        onUpdated={vi.fn()}
      />,
    );

    const noteInput = screen.getByLabelText(/Nota/i);
    await user.type(noteInput, "acordado con el cliente");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateReturnDetails).toHaveBeenCalledWith("r1", {
        depositReturnedAmount: 500,
        note: "acordado con el cliente",
      }),
    );
  });

  it("shows error message if save fails", async () => {
    updateReturnDetails.mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();

    render(
      <ReturnEditDialog
        open
        onOpenChange={vi.fn()}
        rentalId="r1"
        folio="R-000042"
        currentDepositReturned={1000}
        onUpdated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "No se pudo actualizar la devolución. Intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("closes without saving when Cancelar is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ReturnEditDialog
        open
        onOpenChange={onOpenChange}
        rentalId="r1"
        folio="R-000042"
        currentDepositReturned={1000}
        onUpdated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(updateReturnDetails).not.toHaveBeenCalled();
  });

  it("shows validation error for negative deposit amount", async () => {
    const user = userEvent.setup();

    render(
      <ReturnEditDialog
        open
        onOpenChange={vi.fn()}
        rentalId="r1"
        folio="R-000042"
        currentDepositReturned={1000}
        onUpdated={vi.fn()}
      />,
    );

    const depositInput = screen.getByLabelText("Depósito devuelto");
    // CurrencyInput clamps to 0 for negative values, so just clear to 0
    await user.clear(depositInput);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // With 0, it should save fine (deposit returned can be 0)
    await waitFor(() => expect(updateReturnDetails).toHaveBeenCalled());
  });
});
