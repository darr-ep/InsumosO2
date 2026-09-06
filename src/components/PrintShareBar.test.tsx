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

  it("shows Imprimir and calls onPrint when printAvailable, and relabels to Imprimir nuevamente once printed", async () => {
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

    // Failed/not-yet-tried both just read "Imprimir" — no separate
    // "reintentar" wording (post-launch polish, normalized with
    // RentalCreatedSummary's button hierarchy).
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();

    rerender(
      <PrintShareBar
        printAvailable
        printStatus="printed"
        onPrint={onPrint}
        shareAvailable={false}
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Imprimir nuevamente" }),
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

  // design-fidelity Slice C (design obs #2224 §C5, owner decision #2218-4):
  // Imprimir/Compartir move side by side, but DOM order stays
  // Imprimir → Compartir → Cerrar so the primary action (Cerrar) is still
  // last, per §16.4 tab/AT order — even though the layout is now horizontal.
  // design-fidelity post-audit bugfix batch, Fix 3: both buttons must look
  // IDENTICAL (design has no outline variant on either) — previously
  // Imprimir was `secondary` and Compartir was `outline`, a visual mismatch.
  it("renders Imprimir and Compartir with the same variant (both secondary, no outline)", () => {
    render(
      <PrintShareBar
        printAvailable
        printStatus="idle"
        onPrint={vi.fn()}
        shareAvailable
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const printClasses = screen
      .getByRole("button", { name: "Imprimir" })
      .className.split(" ");
    const shareClasses = screen
      .getByRole("button", { name: "Compartir" })
      .className.split(" ");

    expect(printClasses).toContain("bg-secondary");
    expect(shareClasses).toContain("bg-secondary");
    expect(printClasses).not.toContain("border");
    expect(shareClasses).not.toContain("border");
    expect(printClasses).not.toContain("bg-card");
    expect(shareClasses).not.toContain("bg-card");
  });

  it("keeps Imprimir before Compartir before Cerrar in DOM order, even laid out side by side (design-fidelity §C5)", () => {
    render(
      <PrintShareBar
        printAvailable
        printStatus="idle"
        onPrint={vi.fn()}
        shareAvailable
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Imprimir", "Compartir", "Cerrar"]);
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
