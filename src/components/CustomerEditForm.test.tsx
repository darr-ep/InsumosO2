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

  it("calls onCancel immediately (no confirmation) when Cancelar is pressed with no changes made", async () => {
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
    expect(
      screen.queryByRole("heading", { name: "¿Descartar los cambios?" }),
    ).not.toBeInTheDocument();
  });

  it("shows a confirmation dialog before discarding unsaved name/phone changes (design-fidelity #8, owner decision obs #2222)", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerEditForm
        initialValues={{ name: "Juan Pérez", phone: "5512345678" }}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );

    await user.type(screen.getByLabelText("Nombre"), " Segundo");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.getByRole("heading", { name: "¿Descartar los cambios?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Se perderán los cambios que hiciste al nombre o teléfono.",
      ),
    ).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("'Seguir editando' keeps the edited values and does not call onCancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerEditForm
        initialValues={{ name: "Juan Pérez", phone: "5512345678" }}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );

    await user.type(screen.getByLabelText("Teléfono"), "9");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(
      screen.queryByRole("heading", { name: "¿Descartar los cambios?" }),
    ).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Teléfono")).toHaveValue("55123456789");
  });

  it("discards the changes and calls onCancel when 'Sí, descartar' is confirmed", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerEditForm
        initialValues={{ name: "Juan Pérez", phone: "5512345678" }}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );

    await user.type(screen.getByLabelText("Nombre"), " Segundo");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Sí, descartar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
