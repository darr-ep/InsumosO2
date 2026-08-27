import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/PaymentDialog";

const createPayment = vi.fn();

vi.mock("@/data/payments.repo", () => ({
  createPayment: (...args: unknown[]) => createPayment(...args),
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
  });

  it("pre-fills the amount with the suggested value and registers a rent payment", async () => {
    createPayment.mockResolvedValueOnce({ id: "p1" });
    const onOpenChange = vi.fn();
    const onRegistered = vi.fn();
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        rentalId="r1"
        suggestedAmount={3000}
        hasPreviousRentPayment
        onRegistered={onRegistered}
      />,
    );

    expect(screen.getByLabelText("Monto")).toHaveValue(3000);

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(createPayment).toHaveBeenCalledWith({
      rentalId: "r1",
      amount: 3000,
      paymentType: "rent",
      note: undefined,
    });
    expect(onRegistered).toHaveBeenCalledWith({ id: "p1" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("fires a success toast when the payment is registered (§16.13/§17, gap-fill finding 4)", async () => {
    createPayment.mockResolvedValueOnce({ id: "p1" });
    const user = userEvent.setup();

    render(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        rentalId="r1"
        suggestedAmount={3000}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

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
        suggestedAmount={3000}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

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
        suggestedAmount={3000}
        hasPreviousRentPayment
      />,
    );

    await user.clear(screen.getByLabelText("Monto"));
    await user.type(screen.getByLabelText("Monto"), "3500");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

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
        suggestedAmount={3000}
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
        suggestedAmount={3000}
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
        suggestedAmount={3000}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      await screen.findByText(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a Guardando… loading label on the confirm button while submitting, reverting after success (§16.13)", async () => {
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
        suggestedAmount={3000}
        hasPreviousRentPayment
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();

    resolveCreatePayment({ id: "p1" });

    expect(
      await screen.findByRole("button", { name: "Confirmar" }),
    ).toBeInTheDocument();
  });
});
