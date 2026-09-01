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

  it("shows cliente, productos, fecha de inicio, tiempo transcurrido and depósito, with the suggested amounts as placeholders (CU6 first scenario)", () => {
    render(<ReturnDialog {...baseProps} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("1 x Concentrador")).toBeInTheDocument();
    expect(screen.getByText("5 días")).toBeInTheDocument();
    // Redesign — UX/UI pass: both amounts start empty (placeholder shows
    // the suggestion) — never a prefilled value a rushed confirm could
    // silently accept.
    expect(screen.getByLabelText(/monto cobrado/i)).toHaveValue(null);
    expect(screen.getByLabelText(/monto cobrado/i)).toHaveAttribute(
      "placeholder",
      "2800",
    );
    expect(screen.getByLabelText("Depósito a devolver")).toHaveValue(null);
    expect(screen.getByLabelText("Depósito a devolver")).toHaveAttribute(
      "placeholder",
      "1000",
    );
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

  it("fires a success toast when the return is registered (§16.13/§17, gap-fill finding 4)", async () => {
    returnRental.mockResolvedValueOnce({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Devolución registrada.");
  });

  it("does NOT fire a success toast when the return fails to save (§16.13/§17, gap-fill finding 4)", async () => {
    returnRental.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    await screen.findByText(
      "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rejects a negative amount without calling returnRental", async () => {
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    const amountInput = screen.getByLabelText(/monto cobrado/i);
    await user.clear(amountInput);
    await user.type(amountInput, "-100");

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    expect(
      await screen.findByText("El monto cobrado no puede ser negativo."),
    ).toBeInTheDocument();
    expect(returnRental).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the dialog open when the return call fails (§21)", async () => {
    returnRental.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ReturnDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

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

    await waitFor(() => expect(returnRental).toHaveBeenCalledTimes(1));
    expect(returnRental).toHaveBeenCalledWith({
      rentalId: "rental1",
      amountCollected: 2800,
      depositReturned: 0,
      note: undefined,
    });
  });

  it("shows a Guardando… loading label on the confirm button while submitting, reverting after success (§16.13)", async () => {
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

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();

    resolveReturnRental({
      id: "rental1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });

    expect(
      await screen.findByRole("button", { name: "Confirmar devolución" }),
    ).toBeInTheDocument();
  });
});
