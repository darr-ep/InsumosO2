import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LoadingDialog } from "@/components/LoadingDialog";

/**
 * "Carga" family (pencil ground truth, 7 identical-layout frames — see
 * `LoadingDialog.tsx`'s own docblock). No buttons, no close (X), no
 * user-facing dismissal at all: only the caller flipping `open` to `false`
 * closes it.
 */
describe("LoadingDialog (design-fidelity, shared component)", () => {
  it("renders the title, description, a spinner, and a progress bar, with no close (X) or buttons", () => {
    render(
      <LoadingDialog
        open
        title="Procesando pago..."
        description="Estamos registrando el pago de la renta."
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Procesando pago..." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Estamos registrando el pago de la renta."),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cerrar" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not render anything when closed", () => {
    render(
      <LoadingDialog open={false} title="Cargando..." description="..." />,
    );

    expect(
      screen.queryByRole("heading", { name: "Cargando..." }),
    ).not.toBeInTheDocument();
  });

  it("ignores Escape and outside clicks while open — there is no way to dismiss it early", () => {
    render(
      <LoadingDialog
        open
        title="Creando renta..."
        description="Estamos procesando la renta y generando el comprobante."
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.getByRole("heading", { name: "Creando renta..." }),
    ).toBeInTheDocument();
  });
});
