import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrintShareBar } from "@/components/PrintShareBar";

/**
 * SDD.md §17 ("PrintShareBar (imprimir / compartir, desacoplado, nunca
 * bloqueante)"). Gap-fill finding 5: extracted out of ReceiptDialog's
 * inline DialogFooter — a pure structural extraction, so these tests lock
 * the shared button-visibility/label/callback contract, while
 * ReceiptDialog.test.tsx remains the source of truth for the full print/
 * share flow (Bluetooth orchestration, error states, etc.).
 */
describe("PrintShareBar (§17)", () => {
  it("always shows a Cerrar button that calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PrintShareBar
        printAvailable={false}
        printStatus="idle"
        onPrint={vi.fn()}
        shareAvailable={false}
        onShare={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides Imprimir/Compartir when neither is available", () => {
    render(
      <PrintShareBar
        printAvailable={false}
        printStatus="idle"
        onPrint={vi.fn()}
        shareAvailable={false}
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compartir" }),
    ).not.toBeInTheDocument();
  });

  it("shows Imprimir and calls onPrint when printAvailable, and relabels to Reintentar impresión on failure", async () => {
    const onPrint = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PrintShareBar
        printAvailable
        printStatus="idle"
        onPrint={onPrint}
        shareAvailable={false}
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(onPrint).toHaveBeenCalledTimes(1);

    rerender(
      <PrintShareBar
        printAvailable
        printStatus="failed"
        onPrint={onPrint}
        shareAvailable={false}
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Reintentar impresión" }),
    ).toBeInTheDocument();
  });

  it("disables Imprimir while printing", () => {
    render(
      <PrintShareBar
        printAvailable
        printStatus="printing"
        onPrint={vi.fn()}
        shareAvailable={false}
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
  });

  it("shows Compartir and calls onShare when shareAvailable", async () => {
    const onShare = vi.fn();
    const user = userEvent.setup();
    render(
      <PrintShareBar
        printAvailable={false}
        printStatus="idle"
        onPrint={vi.fn()}
        shareAvailable
        onShare={onShare}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
