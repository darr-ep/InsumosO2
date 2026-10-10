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
    createPayment.mockResolvedValueOnce({
      id: "p1",
      created: "2026-08-29T10:00:00.000Z",
    });
    const onOpenChange = vi.fn();
    const onRegistered = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        rentalId="r1"
        folio="R-000001"
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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
    expect(onRegistered).toHaveBeenCalledWith(
      { id: "p1", created: "2026-08-29T10:00:00.000Z" },
      {
        kind: "payment",
        businessName: "Insumos O2",
        businessPhone: "771 131 3535",
        folio: "R-000001",
        customerName: "Juan Pérez",
        customerPhone: "5512345678",
        paymentType: "rent",
        amount: 3000,
        date: new Date("2026-08-29T10:00:00.000Z"),
        note: undefined,
      },
    );
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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
        "Se registrará un pago de $3,000.00 en la renta de Juan Pérez.",
      ),
    ).toBeInTheDocument();
    expect(createPayment).not.toHaveBeenCalled();

    createPayment.mockResolvedValueOnce({ id: "p1" });
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
  });

  it("registers a rent payment with an optional note", async () => {
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.type(
      screen.getByLabelText(/Nota/i),
      "Pago quincenal acordado",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    expect(createPayment).toHaveBeenCalledWith({
      rentalId: "r1",
      amount: 3000,
      paymentType: "rent",
      note: "Pago quincenal acordado",
    });
  });

  it("does NOT fire a toast on success — the PaymentCreatedSummary receipt (handed to onRegistered) is the confirmation now, design-fidelity 'Éxito · Pago registrado', superseding the old §16.13/§17 gap-fill toast", async () => {
    createPayment.mockResolvedValueOnce({
      id: "p1",
      created: "2026-08-29T10:00:00.000Z",
    });
    const onRegistered = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
        onRegistered={onRegistered}
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(onRegistered.mock.calls[0][1]).toMatchObject({ kind: "payment" });
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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

  it("keeps the form filled and shows an error when the save fails (§21)", async () => {
    createPayment.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        folio="R-000001"
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
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

  it("closes the confirmation popup immediately and shows the 'Procesando pago...' loading popup while submitting, reverting to the idle trigger after success (§16.13, design-fidelity #2/#3, pencil ground truth 'Carga · Procesando pago')", async () => {
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
        businessName="Insumos O2"
        businessPhone="771 131 3535"
        customerName="Juan Pérez"
        customerPhone="5512345678"
        suggestedAmount={3000}
        initialRentAmount={2800}
        hasPreviousRentPayment
      />,
    );

    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    // The button-based ConfirmDialog closes immediately on confirm — the
    // real per-action loading state is the separate, button-less
    // LoadingDialog, not ConfirmDialog's own loading state. The underlying
    // "Confirmar" trigger is `aria-hidden` behind the now-open
    // LoadingDialog (Radix modal-dialog inert behavior), so it's not
    // queryable while this is pending.
    expect(
      screen.queryByRole("heading", { name: "¿Registrar este pago?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Procesando pago..." }),
    ).toBeInTheDocument();

    resolveCreatePayment({ id: "p1" });

    expect(
      await screen.findByRole("button", { name: "Confirmar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Procesando pago..." }),
    ).not.toBeInTheDocument();
  });
});
