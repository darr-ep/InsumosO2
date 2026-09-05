import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows folio, cliente, teléfono, estado, productos, renta, depósito, total pagado (§16.10, Redesign Round 3: header + resumen)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([
      { id: "i1", item_type: "concentrator", quantity: 2 },
    ]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p2",
        amount: 3000,
        payment_type: "rent",
        created: "2026-08-15T14:41:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);

    renderSheet();

    expect(await screen.findByText("Renta R-000001")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("5512345678")).toBeInTheDocument();
    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.getByText("$2,800.00")).toBeInTheDocument(); // renta
    // Total pagado ($4,000 = 3000+1000) — only appears once, in Resumen.
    expect(screen.getByText("$4,000.00")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("renders the full payment history — amount, type, date, who registered it and its note (§7.2, Redesign Round 3, punto D)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p2",
        amount: 2800,
        payment_type: "rent",
        created: "2026-08-29T14:41:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-29T14:40:00.000Z",
        note: "Pago con tarjeta",
        expand: { created_by: { name: "Ana" } },
      },
    ]);

    renderSheet();

    const historySection = (
      await screen.findByText("Historial de pagos")
    ).closest("section")!;

    expect(within(historySection).getByText("Mensualidad")).toBeInTheDocument();
    expect(
      within(historySection).getByText("Depósito inicial"),
    ).toBeInTheDocument();
    expect(within(historySection).getByText("Registró: Juan")).toBeInTheDocument();
    expect(within(historySection).getByText("Registró: Ana")).toBeInTheDocument();
    expect(within(historySection).getByText("Pago con tarjeta")).toBeInTheDocument();
  });

  it("shows the payment history in chronological order — oldest (Depósito inicial) first, most recent last (business-owner finding, post-launch audit)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    // `listPaymentsForRental` itself returns newest-first (its own
    // documented sort, unchanged) — the sheet must reverse this for
    // display only.
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p2",
        amount: 2800,
        payment_type: "rent",
        created: "2026-08-29T14:41:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);

    renderSheet();

    const historySection = (
      await screen.findByText("Historial de pagos")
    ).closest("section")!;
    const labels = within(historySection)
      .getAllByText(/Depósito inicial|Mensualidad/)
      .map((el) => el.textContent);

    expect(labels).toEqual(["Depósito inicial", "Mensualidad"]);
  });

  it("lets reprinting the Depósito inicial receipt from its own row in the history (per-action reprint)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([
      { id: "i1", item_type: "concentrator", quantity: 1 },
    ]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);
    const user = userEvent.setup();

    renderSheet();

    await user.click(
      await screen.findByRole("button", {
        name: "Reimprimir comprobante de depósito inicial",
      }),
    );

    expect(
      await screen.findByText(`Comprobante ${activeRental.folio}`),
    ).toBeInTheDocument();
  });

  it("lets reprinting a Mensualidad (rent) payment's own receipt from its history row (post-launch: every row is reprintable, not just Depósito inicial)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([
      { id: "i1", item_type: "concentrator", quantity: 1 },
    ]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p2",
        amount: 2300,
        payment_type: "rent",
        created: "2026-09-10T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);
    const user = userEvent.setup();

    renderSheet();

    await user.click(
      await screen.findByRole("button", {
        name: "Reimprimir comprobante de mensualidad",
      }),
    );

    expect(
      await screen.findByText(`Comprobante de pago ${activeRental.folio}`),
    ).toBeInTheDocument();
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

  it("confirming a return shows a short confirmation first, not the full comprobante (Redesign Round 3, punto 5)", async () => {
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
        name: "Devolución registrada ✓",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Comprobante de devolución R-000001",
      }),
    ).not.toBeInTheDocument();
  });

  it("navigates to Dashboard when Volver al inicio is pressed on the short confirmation (§18, Redesign Round 3, punto 5)", async () => {
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
    await screen.findByRole("heading", { name: "Devolución registrada ✓" });

    await user.click(
      screen.getByRole("button", { name: "Volver al inicio" }),
    );

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

  it("hides 'Ver ficha de cliente' when no onViewCustomer handler is provided (nested inside CustomerDetailSheet)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);

    renderSheet();

    await screen.findByText("Renta R-000001");
    expect(
      screen.queryByRole("button", { name: "Ver ficha de cliente" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error and does not silently keep stale data when refreshing after a return fails (Redesign Round 3 resiliencia fix)", async () => {
    getRental
      .mockResolvedValueOnce(activeRental)
      .mockRejectedValueOnce(new Error("network"));
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
    await screen.findByRole("heading", { name: "Devolución registrada ✓" });

    expect(
      await screen.findByText(
        "No se pudo actualizar la renta. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
  });
});
