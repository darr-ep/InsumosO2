import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * design-fidelity (obs #2221/#2224/#2223, capability `confirmation-dialogs`).
 * Shared `ConfirmDialog` — visual contract per frame `d41cks`: no close
 * button, `DialogDescription` rendered (a11y), initial focus on Cancel
 * (achieved by DOM order, not an explicit autofocus override — pinned here
 * so a future markup reorder can't silently move focus onto the confirm
 * button), `isConfirming` disables both buttons during an async mutation.
 */
describe("ConfirmDialog (design-fidelity, shared component)", () => {
  it("renders the title and description, with no close (X) button", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="¿Devolver esta renta?"
        description="La renta R-000001 se marcará como devuelta. Esta acción no se puede deshacer."
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "¿Devolver esta renta?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La renta R-000001 se marcará como devuelta. Esta acción no se puede deshacer.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cerrar" }),
    ).not.toBeInTheDocument();
  });

  it("defaults to Cancelar/Confirmar labels and puts initial focus on Cancelar", async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="¿Cerrar sesión?"
        description="Tendrás que volver a escribir tu contraseña para entrar de nuevo."
        onConfirm={() => {}}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Cancelar" });
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    await waitFor(() => expect(cancelButton).toHaveFocus());
  });

  it("calls onOpenChange(false) when Cancelar is tapped, without calling onConfirm", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Descartar los cambios?"
        description="Se perderán los cambios que hiciste al nombre o teléfono."
        cancelLabel="Seguir editando"
        confirmLabel="Sí, descartar"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm exactly once when the confirm button is tapped, using the given labels", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="¿Salir sin guardar la renta?"
        description="Se perderá todo lo que capturaste: cliente, productos y montos."
        cancelLabel="Seguir aquí"
        confirmLabel="Sí, salir"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sí, salir" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both Cancelar and the confirm button while isConfirming is true", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="¿Registrar este pago?"
        description="Se registrará un pago de $3,000.00 en la renta R-000001."
        confirmLabel="Sí, registrar"
        onConfirm={() => {}}
        isConfirming
      />,
    );

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sí, registrar" }),
    ).toBeDisabled();
  });

  it("does not dismiss via Escape while a mutation is in flight (isConfirming)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Registrar este pago?"
        description="Se registrará un pago de $3,000.00 en la renta R-000001."
        confirmLabel="Sí, registrar"
        onConfirm={() => {}}
        isConfirming
      />,
    );

    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("still dismisses via Escape when not confirming (no regression)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Registrar este pago?"
        description="Se registrará un pago de $3,000.00 en la renta R-000001."
        confirmLabel="Sí, registrar"
        onConfirm={() => {}}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not dismiss via an outside pointer-down/click while a mutation is in flight (isConfirming)", async () => {
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Devolver esta renta?"
        description="La renta R-000001 se marcará como devuelta. Esta acción no se puede deshacer."
        confirmLabel="Sí, devolver"
        onConfirm={() => {}}
        isConfirming
      />,
    );

    // Radix's Dialog defers a pointer-down-outside dismissal until the
    // matching "click" fires (it registers its `pointerdown` listener
    // asynchronously too), so both are simulated here to reproduce a real
    // outside-click interaction.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("still dismisses via an outside pointer-down/click when not confirming (no regression)", async () => {
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Devolver esta renta?"
        description="La renta R-000001 se marcará como devuelta. Esta acción no se puede deshacer."
        confirmLabel="Sí, devolver"
        onConfirm={() => {}}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // Post-audit bugfix (design-fidelity, obs #2228 batch): this component's
  // own docblock says the confirm button is "default/black unless
  // tone=\"destructive\"" — but `Button`'s `default` variant is
  // `bg-primary` (the app's blue). Asserts the non-destructive confirm
  // button renders black/neutral-dark, not blue.
  it("renders the confirm button black (not primary-blue) when tone is default (non-destructive)", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="¿Devolver esta renta?"
        description="La renta R-000001 se marcará como devuelta. Esta acción no se puede deshacer."
        confirmLabel="Sí, devolver"
        onConfirm={() => {}}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Sí, devolver" });
    expect(confirmButton).not.toHaveClass("bg-primary");
    expect(confirmButton).toHaveClass("bg-neutral-900");
  });

  it("still renders the confirm button with the destructive variant when tone is destructive (no regression)", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="¿Eliminar este registro?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Sí, eliminar"
        onConfirm={() => {}}
        tone="destructive"
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Sí, eliminar" });
    expect(confirmButton).toHaveClass("bg-destructive");
    expect(confirmButton).not.toHaveClass("bg-neutral-900");
  });

  it("does not render when open is false", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="¿Tomar otra foto?"
        description="Se borrará la foto que acabas de tomar."
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "¿Tomar otra foto?" }),
    ).not.toBeInTheDocument();
  });
});
