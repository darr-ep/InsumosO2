import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ClientResponseError } from "pocketbase";
import { ReturnDialog } from "@/components/ReturnDialog";
import { consumeSessionMessage, STALE_SESSION_MESSAGE } from "@/data/staleSession";

const returnRental = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  returnRental: (...args: unknown[]) => returnRental(...args),
}));

const clear = vi.fn();

// §14 gap-fill: `handleConfirm`'s catch block calls the real
// `staleSession.ts` helper, which calls `pb.authStore.clear()` — mocked
// the same way App.test.tsx already mocks `pb`.
vi.mock("@/data/pocketbaseClient", () => ({
  pb: { authStore: { clear: (...args: unknown[]) => clear(...args) } },
}));

// Gap-fill finding 4 (§16.13/§17): ReturnDialog gave zero success
// confirmation before this — mocked here so these tests can assert the
// exact toast call without a real (visually-timed) Sonner render.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  rentalId: "rental1",
  businessName: "Insumos O2",
  businessPhone: "771 131 3535",
  folio: "R-000001",
  customerName: "Juan Pérez",
  customerPhone: "5512345678",
  items: [{ itemType: "concentrator" as const, quantity: 1 }],
  startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  depositAmount: 1000,
  suggestedAmount: 2800,
  initialRentAmount: 2800,
  totalRentPaid: 5600,
  hasPreviousRentPayment: false,
};

describe("ReturnDialog (§7.3, §16.8, CU6, task 3.2)", () => {
  afterEach(() => {
    returnRental.mockReset();
    baseProps.onOpenChange.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    clear.mockReset();
    consumeSessionMessage();
  });

  it("shows cliente, productos, fecha de inicio, tiempo transcurrido and depósito, with empty amount inputs (CU6 first scenario)", () => {
    render(<ReturnDialog {...baseProps} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("1 x Concentrador")).toBeInTheDocument();
    expect(screen.getByText("5 días")).toBeInTheDocument();
    // Redesign — UX/UI pass: both amounts start empty (placeholder shows
    // the suggestion) — never a prefilled value a rushed confirm could
    // silently accept.
    // Post-launch polish: both placeholders are now a static "$ 0" — the
    // suggested "Monto cobrado" is already shown as text above that input
    // ("Renta acordada"/"Último pago"), and the suggested deposit is
    // already shown in the read-only "Depósito" row above — repeating
    // either in the placeholder was redundant.
    expect(screen.getByLabelText(/monto cobrado/i)).toHaveValue("");
    expect(screen.getByLabelText(/monto cobrado/i)).toHaveAttribute(
      "placeholder",
      "$2,800.00",
    );
    expect(screen.getByLabelText("Depósito a devolver")).toHaveValue("");
    expect(screen.getByLabelText("Depósito a devolver")).toHaveAttribute(
      "placeholder",
      "$1,000.00",
    );
  });

  it("shows a confirmation dialog before calling returnRental, and only calls returnRental after confirming (design-fidelity #1, obs #2223/#2224)", async () => {
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    expect(
      screen.getByRole("heading", { name: "¿Devolver esta renta?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La renta R-000001 se marcará como devuelta. Esta acción no se puede deshacer.",
      ),
    ).toBeInTheDocument();
    expect(returnRental).not.toHaveBeenCalled();

    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
  });

  it("keeps the dialog open and the typed amounts intact when the confirmation is cancelled, without calling returnRental (design-fidelity #1, sibling-render pattern)", async () => {
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.type(screen.getByLabelText(/monto cobrado/i), "5000");
    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("heading", { name: "¿Devolver esta renta?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/monto cobrado/i)).toHaveValue("$ 5,000");
    expect(returnRental).not.toHaveBeenCalled();
  });

  it("calls returnRental with the (possibly edited) amounts and builds a return receipt on confirm (CU6 second/third scenarios)", async () => {
    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const onReturned = vi.fn();
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} onReturned={onReturned} />);

    await user.type(screen.getByLabelText(/monto cobrado/i), "5000");
    await user.type(screen.getByLabelText("Depósito a devolver"), "1000");

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(returnRental).toHaveBeenCalledWith({
      rentalId: "rental1",
      amountCollected: 5000,
      depositReturned: 1000,
      note: undefined,
    });
    expect(onReturned).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "return",
        folio: "R-000001",
        amountCollected: 5000,
        depositReturned: 1000,
      }),
    );
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  // design-fidelity post-audit bugfix batch: this toast was superseded by
  // `ReturnCreatedSummary`'s own "Devolución registrada" dialog, which
  // `onReturned` opens right after this one closes — showing both said the
  // same thing twice.
  it("does NOT fire a success toast when the return is registered (superseded by ReturnCreatedSummary's own confirmation)", async () => {
    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does NOT fire a success toast when the return fails to save (§16.13/§17, gap-fill finding 4)", async () => {
    returnRental.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await screen.findByText(
      "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("strips a typed minus sign instead of accepting a negative amount (CurrencyInput is digits-only)", async () => {
    // Redesign — UX/UI pass (currency formatting): `amount_collected` can
    // never be negative (domain/rentals/return.ts's schema: `min(0)`), so
    // switching this field to `CurrencyInput` prevents the invalid state at
    // the input level instead of catching it after submit — "-100" typed
    // reports as "100" (the "-" is simply not a digit), the field can never
    // hold a negative value to begin with.
    const returnedAt = "2026-08-26T12:00:00.000Z";
    returnRental.mockResolvedValueOnce({ id: "rental1", returned_at: returnedAt });
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    const amountInput = screen.getByLabelText(/monto cobrado/i);
    await user.type(amountInput, "-100");

    expect(amountInput).toHaveValue("$ 100");

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(returnRental).toHaveBeenCalledWith(
      expect.objectContaining({ amountCollected: 100 }),
    );
  });

  it("shows an error and keeps the dialog open when the return call fails (§21)", async () => {
    returnRental.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    expect(
      await screen.findByText(
        "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(baseProps.onOpenChange).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("still shows the generic return-error message (never redirects) on this app's own business-rule rejection, e.g. an already-returned rental (§14 gap-fill, requirement: don't swallow real errors)", async () => {
    returnRental.mockRejectedValueOnce(
      new ClientResponseError({
        status: 400,
        response: { message: "Esta renta ya fue devuelta.", data: {} },
      }),
    );
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    expect(
      await screen.findByText(
        "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the session instead of showing the generic return-error message when the call fails with a stale-session-shaped error (§14 gap-fill)", async () => {
    returnRental.mockRejectedValueOnce(
      new ClientResponseError({
        status: 400,
        response: { message: "Failed to update record.", data: {} },
      }),
    );
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(
        "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
      ),
    ).not.toBeInTheDocument();
    expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
  });

  it("shows a live 'Total a entregar' summary that reflects the typed deposit-return amount (business-owner request)", async () => {
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    const totalRow = screen.getByText("Total a entregar").closest("div")!;
    expect(within(totalRow).getByText("$0.00")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Depósito a devolver"), "1000");

    expect(within(totalRow).getByText("$1,000.00")).toBeInTheDocument();
  });

  it("hides the 'Depósito a devolver' field entirely when the rental never collected a deposit — 'Monto cobrado' still shows (business-owner finding, post-launch audit)", () => {
    render(<ReturnDialog {...baseProps} depositAmount={0} />);

    expect(screen.getByLabelText(/monto cobrado/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Depósito a devolver"),
    ).not.toBeInTheDocument();

    const totalRow = screen.getByText("Total a entregar").closest("div")!;
    expect(within(totalRow).getByText("$0.00")).toBeInTheDocument();
  });

  it("sends deposit_returned: 0 when there's no deposit, even without a deposit input to type into", async () => {
    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} depositAmount={0} />);

    await user.type(screen.getByLabelText(/monto cobrado/i), "2800");
    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(returnRental).toHaveBeenCalledWith({
      rentalId: "rental1",
      amountCollected: 2800,
      depositReturned: 0,
      note: undefined,
    });
  });

  it("closes the confirmation popup immediately and shows the 'Procesando devolución...' loading popup while submitting, reverting to the idle trigger after success (§16.13, design-fidelity #1, pencil ground truth 'Carga · Procesando devolución')", async () => {
    let resolveReturnRental: (value: {
      id: string;
      returned_at: string;
    }) => void = () => {};
    returnRental.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReturnRental = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    // The button-based ConfirmDialog closes immediately on confirm — the
    // real per-action loading state is the separate, button-less
    // LoadingDialog, not ConfirmDialog's own loading state. The underlying
    // "Confirmar devolución" trigger is `aria-hidden` behind the
    // now-open LoadingDialog (Radix modal-dialog inert behavior), so it's
    // not queryable while this is pending — same as the old ConfirmDialog
    // behavior this replaces.
    expect(
      screen.queryByRole("heading", { name: "¿Devolver esta renta?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Procesando devolución..." }),
    ).toBeInTheDocument();

    resolveReturnRental({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirmar devolución" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole("heading", { name: "Procesando devolución..." }),
    ).not.toBeInTheDocument();
  });
});
