import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("shows the active rental count and a card per rental, including customer, start date, and status (Redesign Batch D)", async () => {
    listActiveRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        status: "ACTIVE",
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
    expect(screen.getByText("Activa")).toBeInTheDocument();
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
        status: "ACTIVE",
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

  /**
   * Redesign Batch D (business-owner brief, round 4): "las rentas antiguas
   * deben destacar visualmente de forma moderada mediante color/indicador
   * de estado" — the stale-rental border now sources its color from the
   * `--warning` design token (`border-warning`) instead of a hardcoded
   * Tailwind color (`border-amber-500`).
   */
  it("marks a stale rental card with the --warning border token, not a hardcoded color", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);

    listActiveRentals.mockResolvedValue([
      {
        id: "r2",
        folio: "R-000002",
        status: "ACTIVE",
        created: oldDate.toISOString(),
        initial_rent_amount: 1500,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    // The same rental is also stale enough to appear in the plain active
    // list below (pre-existing behavior, unrelated to this batch) — scope
    // to the "Requiere revisión" section so this only asserts on the stale
    // card's own border, not a duplicate "Juan Pérez" match.
    const staleHeading = await screen.findByRole("heading", {
      name: "Requiere revisión",
    });
    const staleSection = staleHeading.closest("section");
    const name = within(staleSection as HTMLElement).getByText("Juan Pérez");
    expect(name.closest(".border-warning")).not.toBeNull();
    expect(name.closest(".border-amber-500")).toBeNull();
  });

  it("does not show 'Requiere revisión' when no rental is stale", async () => {
    listActiveRentals.mockResolvedValue([
      {
        id: "r3",
        folio: "R-000003",
        status: "ACTIVE",
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
        status: "ACTIVE",
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
   * Redesign layout-reorder batch (business-owner brief, round 3 — Dashboard
   * "5-10 segundos" content order): "1. Buscador prominente 2. CTA 'Nueva
   * renta' 3. Resumen compacto de rentas activas 4. Indicador de rentas
   * antiguas 5. Lista de rentas activas/recientes". Verifies DOM order via
   * `compareDocumentPosition` since these elements don't share a common
   * text node (`textContent` alone can't see an `<input>`'s value/label).
   */
  it("orders content as: buscador, CTA Nueva renta, resumen de activas, indicador de antiguas, lista (business-owner brief)", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);

    listActiveRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        status: "ACTIVE",
        created: oldDate.toISOString(),
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    const searchInput = await screen.findByLabelText(
      "Buscar por folio, nombre o teléfono",
    );
    const ctaLink = screen.getByRole("link", { name: "Nueva renta" });
    const summary = screen.getByText("Rentas activas");
    const staleHeading = await screen.findByRole("heading", {
      name: "Requiere revisión",
    });
    // This rental is stale enough to render in BOTH the "Requiere revisión"
    // section and the plain list below (pre-existing behavior) — since
    // RentalCard now always shows its folio (Redesign Batch D), "Folio:
    // R-000001" matches twice. The last match is the one in "lista de
    // rentas activas/recientes" (item 5 of the brief's order), which is
    // what this assertion cares about.
    const folioMatches = screen.getAllByText("Folio: R-000001");
    const listItem = folioMatches[folioMatches.length - 1];

    function isBefore(a: Node, b: Node) {
      return Boolean(
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    expect(isBefore(searchInput, ctaLink)).toBe(true);
    expect(isBefore(ctaLink, summary)).toBe(true);
    expect(isBefore(summary, staleHeading)).toBe(true);
    expect(isBefore(staleHeading, listItem)).toBe(true);
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
          status: "ACTIVE",
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

    /**
     * Redesign Batch D (business-owner brief, round 4): `searchRentals`
     * (§7.4) matches across ALL statuses, not just ACTIVE — before this
     * batch, a search-result card never showed status at all, so a
     * returned rental was visually indistinguishable from an active one in
     * the results list. This is the regression this batch closes.
     */
    it("shows the real status on a search result, including a returned rental (searchRentals matches all statuses)", async () => {
      searchRentals.mockResolvedValue([
        {
          id: "r1",
          folio: "R-000184",
          status: "RETURNED",
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

      expect(await screen.findByText("Devuelta")).toBeInTheDocument();
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
        {
          id: "r1",
          folio: "R-000184",
          status: "ACTIVE",
          expand: { customer_id: juan },
        },
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
          status: "ACTIVE",
          created: oldDate.toISOString(),
          initial_rent_amount: 2800,
          expand: { customer_id: juan },
        },
      ]);
      searchRentals.mockResolvedValue([
        {
          id: "r2",
          folio: "R-000184",
          status: "ACTIVE",
          expand: { customer_id: juan },
        },
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
