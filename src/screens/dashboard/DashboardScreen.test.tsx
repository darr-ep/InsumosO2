import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";

const listActiveRentals = vi.fn();
const searchRentals = vi.fn();
const getRental = vi.fn();
const listItemsForRental = vi.fn();
const listPaymentsForRental = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <DashboardScreen />
    </MemoryRouter>,
  );
}

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };

describe("DashboardScreen (§16.3, §16.4, §16.6, Anexo A.3, CU2)", () => {
  beforeEach(() => {
    listActiveRentals.mockReset().mockResolvedValue([]);
    searchRentals.mockReset();
    getRental.mockReset();
    listItemsForRental.mockReset();
    listPaymentsForRental.mockReset();
    vi.stubEnv("VITE_STALE_RENTAL_DAYS", "30");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the active rental count and a card per rental, including customer and start date", async () => {
    listActiveRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        created: "2026-08-20 10:00:00.000Z",
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Rentas activas")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Folio: R-000001")).toBeInTheDocument();
  });

  it("shows an empty state when there are no active rentals (CU2)", async () => {
    listActiveRentals.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByText("No hay rentas activas todavía."),
    ).toBeInTheDocument();
  });

  it("lists a rental older than the threshold under 'Requiere revisión' (CU2, Anexo A.3)", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);

    listActiveRentals.mockResolvedValue([
      {
        id: "r2",
        folio: "R-000002",
        created: oldDate.toISOString(),
        initial_rent_amount: 1500,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Requiere revisión" }),
    ).toBeInTheDocument();
  });

  it("does not show 'Requiere revisión' when no rental is stale", async () => {
    listActiveRentals.mockResolvedValue([
      {
        id: "r3",
        folio: "R-000003",
        created: new Date().toISOString(),
        initial_rent_amount: 1500,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    await screen.findByText("Juan Pérez");
    expect(
      screen.queryByRole("heading", { name: "Requiere revisión" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    listActiveRentals.mockRejectedValue(new Error("network down"));

    renderScreen();

    expect(
      await screen.findByText("No se pudieron cargar las rentas activas."),
    ).toBeInTheDocument();
  });

  it("opens Detalle de renta as a Sheet when a rental card is tapped (§18)", async () => {
    listActiveRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        created: "2026-08-20 10:00:00.000Z",
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);
    getRental.mockResolvedValue({
      id: "r1",
      folio: "R-000001",
      customer_id: "c1",
      status: "ACTIVE",
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

  it("links to Nueva renta (§16.6: botón 'Nueva renta')", async () => {
    listActiveRentals.mockResolvedValue([]);

    renderScreen();

    await screen.findByText("No hay rentas activas todavía.");
    expect(
      screen.getByRole("link", { name: "Nueva renta" }),
    ).toHaveAttribute("href", "/nueva-renta");
  });

  /**
   * Redesign nav batch (business-owner brief, round 2): Buscar is no
   * longer its own route/screen — it's folded into Dashboard's own search
   * bar. Every test case below is ported verbatim (same assertions) from
   * the deleted `SearchScreen.test.tsx` (§7.4, §16.9, CU3) so no behavior
   * coverage is lost in the fold.
   */
  describe("search (folded from the deleted SearchScreen, §7.4/§16.9/CU3)", () => {
    it("shows nothing before typing anything", async () => {
      renderScreen();

      await screen.findByText("No hay rentas activas todavía.");
      expect(searchRentals).not.toHaveBeenCalled();
      expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
    });

    it("searches by folio and shows a result with folio and customer (CU3)", async () => {
      searchRentals.mockResolvedValue([
        {
          id: "r1",
          folio: "R-000184",
          expand: { customer_id: juan },
        },
      ]);
      const user = userEvent.setup();

      renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      await user.type(
        screen.getByLabelText("Buscar por folio, nombre o teléfono"),
        "184",
      );

      expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
      expect(screen.getByText("Folio: R-000184")).toBeInTheDocument();
    });

    it("shows 'sin resultados' when nothing matches (CU3's last scenario)", async () => {
      searchRentals.mockResolvedValue([]);
      const user = userEvent.setup();

      renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      await user.type(
        screen.getByLabelText("Buscar por folio, nombre o teléfono"),
        "xyz123",
      );

      expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
    });

    it("shows an error message when the search fails", async () => {
      searchRentals.mockRejectedValue(new Error("network down"));
      const user = userEvent.setup();

      renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      await user.type(
        screen.getByLabelText("Buscar por folio, nombre o teléfono"),
        "184",
      );

      expect(
        await screen.findByText("No se pudo buscar. Intenta de nuevo."),
      ).toBeInTheDocument();
    });

    it("opens Detalle de renta as a Sheet when a result is tapped (§18)", async () => {
      searchRentals.mockResolvedValue([
        { id: "r1", folio: "R-000184", expand: { customer_id: juan } },
      ]);
      getRental.mockResolvedValue({
        id: "r1",
        folio: "R-000184",
        customer_id: "c1",
        status: "ACTIVE",
        initial_rent_amount: 2800,
        deposit_amount: 1000,
        created: "2026-08-01T10:00:00.000Z",
        expand: { customer_id: juan },
      });
      listItemsForRental.mockResolvedValue([]);
      listPaymentsForRental.mockResolvedValue([]);
      const user = userEvent.setup();

      renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      await user.type(
        screen.getByLabelText("Buscar por folio, nombre o teléfono"),
        "184",
      );
      await user.click(await screen.findByText("Juan Pérez"));

      expect(
        await screen.findByRole("heading", { name: "Renta R-000184" }),
      ).toBeInTheDocument();
    });

    it("hides the active-rentals list and 'Requiere revisión' while a search query is active — one clear list at a time, not two stacked", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      listActiveRentals.mockResolvedValue([
        {
          id: "r1",
          folio: "R-000001",
          created: oldDate.toISOString(),
          initial_rent_amount: 2800,
          expand: { customer_id: juan },
        },
      ]);
      searchRentals.mockResolvedValue([
        { id: "r2", folio: "R-000184", expand: { customer_id: juan } },
      ]);
      const user = userEvent.setup();

      renderScreen();
      await screen.findByText("Rentas activas");
      expect(
        await screen.findByRole("heading", { name: "Requiere revisión" }),
      ).toBeInTheDocument();

      await user.type(
        screen.getByLabelText("Buscar por folio, nombre o teléfono"),
        "184",
      );

      expect(await screen.findByText("Folio: R-000184")).toBeInTheDocument();
      expect(screen.queryByText("Rentas activas")).not.toBeInTheDocument();
      expect(screen.queryByText("Folio: R-000001")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Requiere revisión" }),
      ).not.toBeInTheDocument();
    });
  });
});
