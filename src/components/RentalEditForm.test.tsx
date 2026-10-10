import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RentalEditForm } from "@/components/RentalEditForm";

describe("RentalEditForm", () => {
  const initialValues = {
    initialRentAmount: 2800,
    depositAmount: 1000,
    items: [{ itemType: "concentrator" as const, quantity: 1 }],
  };

  it("pre-fills rent, deposit and items, and submits updated values", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <RentalEditForm
        initialValues={initialValues}
        folio="R-001"
        onSubmit={onSubmit}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );

    const rentInput = screen.getByLabelText("Renta inicial");
    expect(rentInput).toHaveValue("$ 2,800");

    const depositInput = screen.getByLabelText("Depósito inicial");
    expect(depositInput).toHaveValue("$ 1,000");

    // Add 1 tank
    await user.click(screen.getByLabelText("Agregar un tanque"));

    // Change rent to 3200
    await user.clear(rentInput);
    await user.type(rentInput, "3200");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      initialRentAmount: 3200,
      depositAmount: 1000,
      items: [
        { itemType: "concentrator", quantity: 1 },
        { itemType: "tank", quantity: 1 },
      ],
    });
  });

  it("rejects submitting when all product quantities are 0", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <RentalEditForm
        initialValues={initialValues}
        folio="R-001"
        onSubmit={onSubmit}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );

    // Remove the 1 concentrator
    await user.click(screen.getByLabelText("Quitar un concentrador"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("Selecciona al menos un producto."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onCancel immediately when not dirty", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <RentalEditForm
        initialValues={initialValues}
        folio="R-001"
        onSubmit={() => {}}
        onCancel={onCancel}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows discard confirmation when Cancelar is clicked with changes", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <RentalEditForm
        initialValues={initialValues}
        folio="R-001"
        onSubmit={() => {}}
        onCancel={onCancel}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.getByRole("heading", { name: "¿Descartar los cambios?" }),
    ).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sí, descartar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onDelete when Eliminar renta is tapped", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();

    render(
      <RentalEditForm
        initialValues={initialValues}
        folio="R-001"
        onSubmit={() => {}}
        onCancel={() => {}}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Eliminar renta/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
