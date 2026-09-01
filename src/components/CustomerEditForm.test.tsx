import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerEditForm } from "@/components/CustomerEditForm";

describe("CustomerEditForm (Redesign — UX/UI pass, Ficha de cliente edit)", () => {
  it("pre-fills name/phone and submits the edited values", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerEditForm
        initialValues={{ name: "Juan Pérez", phone: "5512345678" }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    const nameInput = screen.getByLabelText("Nombre");
    expect(nameInput).toHaveValue("Juan Pérez");

    await user.clear(nameInput);
    await user.type(nameInput, "Juan P. Pérez");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      name: "Juan P. Pérez",
      phone: "5512345678",
    });
  });

  it("rejects an empty name and never calls onSubmit (customerFormSchema)", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerEditForm
        initialValues={{ name: "Juan Pérez", phone: "5512345678" }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    await user.clear(screen.getByLabelText("Nombre"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancelar is pressed", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerEditForm
        initialValues={{ name: "Juan Pérez", phone: "5512345678" }}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
