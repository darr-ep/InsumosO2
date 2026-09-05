import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ClientResponseError } from "pocketbase";
import { PaymentDialog } from "@/components/PaymentDialog";
import { consumeSessionMessage, STALE_SESSION_MESSAGE } from "@/data/staleSession";

const createPayment = vi.fn();

vi.mock("@/data/payments.repo", () => ({
  createPayment: (...args: unknown[]) => createPayment(...args),
}));

const clear = vi.fn();

// §14 gap-fill: `handleConfirm`'s catch block calls the real
// `staleSession.ts` helper, which calls `pb.authStore.clear()` — mocked
// the same way App.test.tsx already mocks `pb`.
vi.mock("@/data/pocketbaseClient", () => ({
  pb: { authStore: { clear: (...args: unknown[]) => clear(...args) } },
}));

// Gap-fill finding 4 (§16.13/§17): PaymentDialog gave zero success
// confirmation before this — mocked here so these tests can assert the
// exact toast call without a real (visually-timed) Sonner render.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("PaymentDialog (§7.2, §11.2, CU5)", () => {
  beforeEach(() => {
    createPayment.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    clear.mockReset();
    consumeSessionMessage();
  });

  it("shows the suggested value as a placeholder (never prefilled) and registers a rent payment once typed", async () => {
    createPayment.mockResolvedValueOnce({ id: "p1" });
    const onOpenChange = vi.fn();
    const onRegistered = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
        onRegistered={onRegistered}
      />,
    );

    // Redesign — UX/UI pass: the field starts empty so a rushed confirm can
    // never silently accept a stale suggested number — only the placeholder
    // shows it.
    // Post-launch polish: the placeholder is now a static "$ 0" — the
    // suggested amount is already shown as text above the input
    // ("Renta acordada"/"Último pago"), repeating it in the placeholder
    // too was redundant.
    const amountInput = screen.getByLabelText("Monto");
    expect(amountInput).toHaveValue("");
    expect(amountInput).toHaveAttribute("placeholder", "$ 0");

    await user.type(amountInput, "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(createPayment).toHaveBeenCalledWith({
      rentalId: "r1",
      amount: 3000,
      paymentType: "rent",
      note: undefined,
    });
    expect(onRegistered).toHaveBeenCalledWith({ id: "p1" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a confirmation dialog with the payment copy before calling createPayment, and only calls createPayment after confirming (design-fidelity #2, owner decision #2222: always confirm)", async () => {
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      screen.getByRole("heading", { name: "¿Registrar este pago?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Se registrará un pago de $3,000.00 en la renta R-000001. Los pagos no se pueden editar ni borrar después.",
      ),
    ).toBeInTheDocument();
    expect(createPayment).not.toHaveBeenCalled();

    createPayment.mockResolvedValueOnce({ id: "p1" });
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
  });

  it("shows a confirmation dialog with the adjustment copy before calling createPayment, and only calls createPayment after confirming (design-fidelity #3, owner decision #2222: always confirm)", async () => {
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajuste" }));
    await user.clear(screen.getByLabelText("Monto del ajuste"));
    await user.type(screen.getByLabelText("Monto del ajuste"), "-200");
    await user.type(
      screen.getByLabelText("Nota"),
      "se cobró de más por error",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      screen.getByRole("heading", { name: "¿Registrar este ajuste?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Se registrará un ajuste de -$200.00 en la renta R-000001. Los ajustes no se pueden editar ni borrar después.",
      ),
    ).toBeInTheDocument();
    expect(createPayment).not.toHaveBeenCalled();

    createPayment.mockResolvedValueOnce({ id: "p3" });
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
  });

  it("fires a success toast when the payment is registered (§16.13/§17, gap-fill finding 4)", async () => {
    createPayment.mockResolvedValueOnce({ id: "p1" });
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(toast.success).toHaveBeenCalledWith("Pago registrado.");
  });

  it("does NOT fire a success toast when the payment fails to save (§16.13/§17, gap-fill finding 4)", async () => {
    createPayment.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await screen.findByText(
      "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("lets the user register a different amount than the suggested one (CU5)", async () => {
    createPayment.mockResolvedValueOnce({ id: "p2" });
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.clear(screen.getByLabelText("Monto"));
    await user.type(screen.getByLabelText("Monto"), "3500");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3500 }),
    );
  });

  it("rejects an adjustment without a note and never calls createPayment (CU5's last scenario)", async () => {
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajuste" }));
    await user.clear(screen.getByLabelText("Monto del ajuste"));
    await user.type(screen.getByLabelText("Monto del ajuste"), "-200");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      await screen.findByText("La nota es obligatoria para un ajuste."),
    ).toBeInTheDocument();
    // design-fidelity B4: a validation error must never show the confirm
    // popup — the gate sits AFTER local validation.
    expect(
      screen.queryByRole("heading", { name: "¿Registrar este ajuste?" }),
    ).not.toBeInTheDocument();
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("registers an adjustment with a note and a negative amount (CU5)", async () => {
    createPayment.mockResolvedValueOnce({ id: "p3" });
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajuste" }));
    await user.clear(screen.getByLabelText("Monto del ajuste"));
    await user.type(screen.getByLabelText("Monto del ajuste"), "-200");
    await user.type(
      screen.getByLabelText("Nota"),
      "se cobró de más por error",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(createPayment).toHaveBeenCalledWith({
      rentalId: "r1",
      amount: -200,
      paymentType: "adjustment",
      note: "se cobró de más por error",
    });
  });

  it("keeps the form filled and shows an error when the save fails (§21)", async () => {
    createPayment.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(
      await screen.findByText(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("still shows the generic payment-error message (never redirects) on this app's own business-rule rejection, e.g. the payment-race guard (§14 gap-fill, requirement: don't swallow real errors)", async () => {
    createPayment.mockRejectedValueOnce(
      new ClientResponseError({
        status: 400,
        response: {
          message: "No se puede registrar un pago: la renta ya fue devuelta.",
          data: {},
        },
      }),
    );
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(
      await screen.findByText(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the session instead of showing the generic payment-error message when the create fails with a stale-session-shaped error (§14 gap-fill)", async () => {
    createPayment.mockRejectedValueOnce(
      new ClientResponseError({
        status: 400,
        response: { message: "Failed to create record.", data: {} },
      }),
    );
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      ),
    ).not.toBeInTheDocument();
    expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
  });

  it("cancelling the confirmation dialog does not call createPayment and keeps the typed amount (design-fidelity, sibling-render pattern)", async () => {
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("heading", { name: "¿Registrar este pago?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toHaveValue("$ 3,000");
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("disables the confirmation dialog's buttons while submitting (isConfirming), reverting to the idle trigger after success (§16.13, design-fidelity #2/#3)", async () => {
    let resolveCreatePayment: (value: { id: string }) => void = () => {};
    createPayment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreatePayment = resolve;
        }),
    );
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    // design B2: `isConfirming` disables BOTH ConfirmDialog buttons during
    // the async mutation — the underlying "Confirmar" trigger is
    // `aria-hidden` behind the still-open ConfirmDialog while this is
    // pending (Radix nested-dialog inert behavior), so it's not queryable.
    expect(
      screen.getByRole("button", { name: "Sí, registrar" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    resolveCreatePayment({ id: "p1" });

    expect(
      await screen.findByRole("button", { name: "Confirmar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "¿Registrar este pago?" }),
    ).not.toBeInTheDocument();
  });
});
