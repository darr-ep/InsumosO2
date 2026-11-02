import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";

const getRental = vi.fn();
const listItemsForRental = vi.fn();
const returnRental = vi.fn();
const deleteRental = vi.fn();
const updateRental = vi.fn();
const listPaymentsForRental = vi.fn();
const createPayment = vi.fn();
const updatePayment = vi.fn();
const deletePayment = vi.fn();
const navigate = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
  returnRental: (...args: unknown[]) => returnRental(...args),
  deleteRental: (...args: unknown[]) => deleteRental(...args),
  updateRental: (...args: unknown[]) => updateRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  updatePayment: (...args: unknown[]) => updatePayment(...args),
  deletePayment: (...args: unknown[]) => deletePayment(...args),
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
    expect(screen.getByText("55 1234 5678")).toBeInTheDocument();
    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.getByText("$2,800.00")).toBeInTheDocument(); // renta
    // Total pagado ($6,800 = 2800 initial rent + 3000 rent payment + 1000 deposit) — only appears once, in Resumen.
    expect(screen.getByText("$6,800.00")).toBeInTheDocument();
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

    expect(within(historySection).getByText("Pago")).toBeInTheDocument();
    expect(
      within(historySection).getByText("Pago Inicial"),
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
      .getAllByText(/Pago Inicial|Pago/)
      .map((el) => el.textContent);

    expect(labels).toEqual(["Pago Inicial", "Pago"]);
  });

  it("shows Devolución de depósito at the bottom of the payments list when the rental is returned", async () => {
    getRental.mockResolvedValue({
      ...returnedRental,
      deposit_returned_amount: 500,
      returned_at: "2026-08-30T10:00:00.000Z",
      expand: {
        customer_id: { id: "c1", name: "Juan Pérez", phone: "5512345678" },
        returned_by: { name: "Astrid" },
      },
    });
    listItemsForRental.mockResolvedValue([]);
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

    renderSheet();

    const historySection = (
      await screen.findByText("Historial de pagos")
    ).closest("section")!;

    expect(
      within(historySection).getByText("Devolución de depósito"),
    ).toBeInTheDocument();
    expect(within(historySection).getByText("-$500.00")).toBeInTheDocument();
    expect(
      within(historySection).getByText(/Registró:\s+Astrid/),
    ).toBeInTheDocument();
  });

  it("renders payment-history rows with colored circular icon badges (blue-soft for deposit, green-soft for mensualidad/ajuste) and no left-border rule (design-fidelity bugfix batch, Fix 5)", async () => {
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
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);

    renderSheet();

    const historySection = (
      await screen.findByText("Historial de pagos")
    ).closest("section")!;
    const rows = within(historySection).getAllByRole("listitem");

    // Old vertical-stack treatment used a `border-l-2` left-border rule —
    // the restyled horizontal row layout drops it entirely.
    rows.forEach((row) => expect(row).not.toHaveClass("border-l-2"));

    const depositRow = within(historySection)
      .getByText("Pago Inicial")
      .closest("li")!;
    const rentRow = within(historySection)
      .getByText("Pago")
      .closest("li")!;

    expect(depositRow.querySelector(".bg-primary-soft")).not.toBeNull();
    expect(rentRow.querySelector(".bg-success-soft")).not.toBeNull();
  });

  it("keeps 'Registró: {name}' visible under Concepto/Fecha after the Fix 5 restyle (owner-approved app-only feature, NOT removed)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Ana" } },
      },
    ]);

    renderSheet();

    const historySection = (
      await screen.findByText("Historial de pagos")
    ).closest("section")!;

    expect(within(historySection).getByText("Registró: Ana")).toBeInTheDocument();
  });

  it("lets reprinting the Pago Inicial receipt from its own row in the history (per-action reprint)", async () => {
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
        name: "Reimprimir comprobante de pago inicial",
      }),
    );

    expect(
      await screen.findByText(`Comprobante ${activeRental.folio}`),
    ).toBeInTheDocument();
  });

  it("lets reprinting a Pago (rent) payment's own receipt from its history row (post-launch: every row is reprintable, not just Depósito inicial)", async () => {
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
        name: "Reimprimir comprobante de pago",
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

  // Post-audit bugfix (real-device finding): registering a payment leaves
  // the rental active, unlike a return — "Aceptar" on the success summary
  // must only dismiss that popup, never close the rental's own detail
  // sheet out from under the visitor.
  it("keeps the rental detail sheet open after registering a payment and dismissing its success summary", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);
    createPayment.mockResolvedValue({
      id: "p1",
      created: "2026-08-29T10:00:00.000Z",
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderSheet({ onOpenChange });

    await user.click(
      await screen.findByRole("button", { name: "Registrar pago" }),
    );
    await user.type(screen.getByLabelText("Monto"), "3000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sí, registrar" }));

    await screen.findByRole("heading", { name: "Pago registrado" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole("heading", { name: "Pago registrado" }),
    ).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));

    expect(
      await screen.findByRole("heading", {
        name: "Devolución registrada",
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
    const onOpenChange = vi.fn();

    renderSheet({ onOpenChange });

    await user.click(
      await screen.findByRole("button", { name: "Devolver" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar devolución" }),
    );
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));
    await screen.findByRole("heading", { name: "Devolución registrada" });

    await user.click(
      screen.getByRole("button", { name: "Aceptar" }),
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
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

  it("uses a consistent sheet background, no divider under the title, and no corner close button (design-fidelity pencil-fidelity batch)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);

    renderSheet();

    await screen.findByText("Renta R-000001");

    const sheetContent = document.querySelector('[data-slot="sheet-content"]');
    expect(sheetContent).toHaveClass("bg-background");

    const sheetHeader = document.querySelector('[data-slot="sheet-header"]');
    expect(sheetHeader).not.toHaveClass("border-b");

    expect(
      screen.queryByRole("button", { name: "Cerrar" }),
    ).not.toBeInTheDocument();
  });

  it("styles 'Resumen' and 'Historial de pagos' as distinct section headers with their own icon, and shows a count pill next to Historial de pagos (design-fidelity pencil-fidelity batch)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p1",
        amount: 1000,
        payment_type: "deposit",
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
      {
        id: "p2",
        amount: 2800,
        payment_type: "rent",
        created: "2026-08-29T14:41:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);

    renderSheet();

    const resumenHeading = await screen.findByText("Resumen");
    expect(resumenHeading.querySelector("svg")).not.toBeNull();

    const historialHeading = screen.getByText("Historial de pagos");
    expect(historialHeading.querySelector("svg")).not.toBeNull();

    const historySection = historialHeading.closest("section")!;
    const pill = within(historySection).getByText("2");
    expect(pill).toHaveClass("bg-primary-soft", "text-primary", "rounded-full");
  });

  it("wraps each payment-history entry in its own bordered white card (design-fidelity pencil-fidelity batch)", async () => {
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
        created: "2026-08-01T10:00:00.000Z",
        note: "",
        expand: { created_by: { name: "Juan" } },
      },
    ]);

    renderSheet();

    const historySection = (
      await screen.findByText("Historial de pagos")
    ).closest("section")!;
    const rows = within(historySection).getAllByRole("listitem");

    rows.forEach((row) => {
      expect(row).toHaveClass("bg-card", "border", "rounded-xl");
    });
  });

  it("orders the sheet's action buttons with the secondary action ('Devolver') on the left and the primary/confirm action ('Registrar pago') on the right (design-fidelity pencil-fidelity batch)", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);

    renderSheet();

    const registrarButton = await screen.findByRole("button", {
      name: "Registrar pago",
    });
    const devolverButton = screen.getByRole("button", { name: "Devolver" });

    const footer = registrarButton.closest('[data-slot="sheet-footer"]')!;
    expect(footer).toHaveClass("flex-row");

    const buttons = within(footer as HTMLElement).getAllByRole("button");
    expect(buttons[0]).toBe(devolverButton);
    expect(buttons[1]).toBe(registrarButton);
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
    await user.click(screen.getByRole("button", { name: "Sí, devolver" }));
    await screen.findByRole("heading", { name: "Devolución registrada" });

    expect(
      await screen.findByText(
        "No se pudo actualizar la renta. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
  });

  it("confirms and deletes a rental when Eliminar renta is clicked in edit mode", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);
    deleteRental.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const onRentalChanged = vi.fn();
    const user = userEvent.setup();

    renderSheet({ onOpenChange, onRentalChanged });

    const editBtn = await screen.findByRole("button", {
      name: "Editar renta R-000001",
    });
    await user.click(editBtn);

    const deleteBtn = await screen.findByRole("button", {
      name: /Eliminar renta/i,
    });
    await user.click(deleteBtn);

    expect(
      await screen.findByRole("heading", { name: "¿Eliminar esta renta?" }),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", {
      name: "Sí, eliminar renta",
    });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteRental).toHaveBeenCalledWith("r1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onRentalChanged).toHaveBeenCalled();
    });
  });

  it("edits a rental in edit mode and saves changes", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([
      { id: "i1", item_type: "concentrator", quantity: 1 },
    ]);
    listPaymentsForRental.mockResolvedValue([]);
    updateRental.mockResolvedValue({
      ...activeRental,
      initial_rent_amount: 3200,
    });
    const user = userEvent.setup();

    renderSheet();

    const editBtn = await screen.findByRole("button", {
      name: "Editar renta R-000001",
    });
    await user.click(editBtn);

    const rentInput = screen.getByLabelText("Renta inicial");
    await user.clear(rentInput);
    await user.type(rentInput, "3200");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(updateRental).toHaveBeenCalledWith("r1", {
        initialRentAmount: 3200,
        depositAmount: 1000,
        items: [{ itemType: "concentrator", quantity: 1 }],
      });
    });
  });

  it("opens PaymentEditDialog when clicking the edit pencil on a payment row", async () => {
    getRental.mockResolvedValue(activeRental);
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([
      {
        id: "p1",
        amount: 3000,
        payment_type: "rent",
        created: "2026-08-29T10:00:00.000Z",
        note: "Pago 1",
        expand: { created_by: { name: "Juan" } },
      },
    ]);
    const user = userEvent.setup();

    renderSheet();

    const editPaymentBtn = await screen.findByRole("button", {
      name: "Editar pago",
    });
    await user.click(editPaymentBtn);

    expect(
      await screen.findByRole("heading", { name: "Editar pago" }),
    ).toBeInTheDocument();
  });
});
