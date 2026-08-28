import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { HistorialScreen } from "@/screens/historial/HistorialScreen";

const listReturnedRentals = vi.fn();
const getRental = vi.fn();
const listItemsForRental = vi.fn();
const listPaymentsForRental = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listReturnedRentals: (...args: unknown[]) => listReturnedRentals(...args),
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <HistorialScreen />
    </MemoryRouter>,
  );
}

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };

/**
 * Historial de rentas — new route added by the navigation/screen-architecture
 * redesign batch (business-owner brief, round 2): a genuinely new screen,
 * NOT a new business concept — just a different filter/view (RETURNED
 * instead of ACTIVE) over the same `rentals` collection `listReturnedRentals`
 * already exposes. Mirrors DashboardScreen's own test conventions.
 */
describe("HistorialScreen (redesign nav batch — new route)", () => {
  beforeEach(() => {
    listReturnedRentals.mockReset();
    getRental.mockReset();
    listItemsForRental.mockReset();
    listPaymentsForRental.mockReset();
  });

  it("shows a card per returned rental, including customer, folio, and status (Redesign Batch D)", async () => {
    listReturnedRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        status: "RETURNED",
        returned_at: "2026-08-25 10:00:00.000Z",
        created: "2026-08-20 10:00:00.000Z",
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Folio: R-000001")).toBeInTheDocument();
    expect(screen.getByText("Devuelta")).toBeInTheDocument();
  });

  it("shows an empty state when there are no returned rentals", async () => {
    listReturnedRentals.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByText("Aún no hay rentas devueltas."),
    ).toBeInTheDocument();
  });

  it("shows a loading state before the rentals arrive", () => {
    listReturnedRentals.mockReturnValue(new Promise(() => {}));

    renderScreen();

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    listReturnedRentals.mockRejectedValue(new Error("network down"));

    renderScreen();

    expect(
      await screen.findByText("No se pudo cargar el historial de rentas."),
    ).toBeInTheDocument();
  });

  it("opens Detalle de renta as a Sheet when a rental card is tapped (§18 pattern, reused for Historial)", async () => {
    listReturnedRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        status: "RETURNED",
        returned_at: "2026-08-25 10:00:00.000Z",
        created: "2026-08-20 10:00:00.000Z",
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);
    getRental.mockResolvedValue({
      id: "r1",
      folio: "R-000001",
      customer_id: "c1",
      status: "RETURNED",
      initial_rent_amount: 2800,
      deposit_amount: 1000,
      created: "2026-08-20T10:00:00.000Z",
      expand: { customer_id: juan },
    });
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);
    const user = userEvent.setup();

    renderScreen();

    await user.click(await screen.findByText("Juan Pérez"));

    expect(
      await screen.findByRole("heading", { name: "Renta R-000001" }),
    ).toBeInTheDocument();
  });
});
