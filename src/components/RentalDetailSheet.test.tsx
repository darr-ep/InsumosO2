import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";

const getRental = vi.fn();
const listItemsForRental = vi.fn();
const returnRental = vi.fn();
const listPaymentsForRental = vi.fn();
const createPayment = vi.fn();
const navigate = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
  returnRental: (...args: unknown[]) => returnRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return { ...actual, useNavigate: () => navigate };
});

const activeRental = {
  id: "r1",
  folio: "R-000001",
  customer_id: "c1",
  status: "ACTIVE" as const,
  initial_rent_amount: 2800,
  deposit_amount: 1000,
  created: "2026-08-01T10:00:00.000Z",
  expand: { customer_id: { id: "c1", name: "Juan Pérez", phone: "5512345678" } },
};

const returnedRental = { ...activeRental, status: "RETURNED" as const };

function renderSheet(props: Partial<React.ComponentProps<typeof RentalDetailSheet>> = {}) {
  return render(
    <MemoryRouter>
      <RentalDetailSheet
        open
        onOpenChange={vi.fn()}
        rentalId="r1"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("RentalDetailSheet (§16.10, §18, task 3.3)", () => {
  beforeEach(() => {
    getRental.mockReset();
    listItemsForRental.mockReset();
    returnRental.mockReset();
    listPaymentsForRental.mockReset();
    createPayment.mockReset();
    navigate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows folio, cliente, teléfono, productos, renta, depósito, fecha de inicio, último pago, total pagado and estado in that order (§16.10)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([
      { id: "i1", item_type: "concentrator", quantity: 2 },
    ]);
    listPaymentsForRental.mockResolvedValue([
      { id: "p2", amount: 3000, payment_type: "rent" },
      { id: "p1", amount: 1000, payment_type: "deposit" },
    ]);

    renderSheet();

    expect(await screen.findByText("Renta R-000001")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("5512345678")).toBeInTheDocument();
    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.getByText("$2,800.00")).toBeInTheDocument(); // renta
    // Último pago ($3,000) and Total pagado ($4,000 = 3000+1000)
    expect(screen.getByText("$3,000.00")).toBeInTheDocument();
    expect(screen.getByText("$4,000.00")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("shows 'Registrar pago' and 'Devolver' as always-visible buttons (never a menu) while ACTIVE", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);

    renderSheet();

    expect(
      await screen.findByRole("button", { name: "Registrar pago" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Devolver" }),
    ).toBeInTheDocument();
  });

  it("hides 'Registrar pago' and 'Devolver' once the rental is RETURNED (§19 terminal state)", async () => {
    getRental.mockResolvedValue(returnedRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);

    renderSheet();

    expect(await screen.findByText("Devuelta")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar pago" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Devolver" }),
    ).not.toBeInTheDocument();
  });

  it("calls onViewCustomer with the rental's customer_id (§18: Detalle de renta -> Ficha de cliente)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);
    const onViewCustomer = vi.fn();
    const user = userEvent.setup();

    renderSheet({ onViewCustomer });

    await user.click(
      await screen.findByRole("button", { name: "Ver ficha de cliente" }),
    );

    expect(onViewCustomer).toHaveBeenCalledWith("c1");
  });

  it("confirming a return opens the devolución receipt, and closing it navigates to Dashboard (§18)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);
    returnRental.mockResolvedValue({
      id: "r1",
      returned_at: "2026-08-26T12:00:00.000Z",
    });
    const user = userEvent.setup();

    renderSheet();

    await user.click(
      await screen.findByRole("button", { name: "Devolver" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Comprobante de devolución R-000001",
      }),
    ).toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button", { name: "Cerrar" });
    await user.click(closeButtons[0]);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error when the rental fails to load", async () => {
    getRental.mockRejectedValue(new Error("network"));
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);

    renderSheet();

    expect(
      await screen.findByText("No se pudo cargar la renta."),
    ).toBeInTheDocument();
  });
});
