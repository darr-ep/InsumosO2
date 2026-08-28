import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";

const listActiveRentals = vi.fn();
const listActiveRentalItems = vi.fn();
const searchRentals = vi.fn();
const getRental = vi.fn();
const listItemsForRental = vi.fn();
const listPaymentsForRental = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  listActiveRentalItems: (...args: unknown[]) => listActiveRentalItems(...args),
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
    listActiveRentalItems.mockReset().mockResolvedValue([]);
    searchRentals.mockReset();
    getRental.mockReset();
    listItemsForRental.mockReset();
    listPaymentsForRental.mockReset();
    vi.stubEnv("VITE_STALE_RENTAL_DAYS", "30");
    // VITE_TOTAL_CONCENTRADORES/VITE_TOTAL_TANQUES deliberately NOT stubbed
    // here — most tests below exercise the real "totally unset" default
    // (Redesign Round 2, Batch 4), see the dedicated test for that. Tests
    // that need real math stub them explicitly.
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
    const activeTile = await screen.findByRole("group", {
      name: "Rentas activas: 1",
    });
    expect(within(activeTile).getByText("1")).toBeInTheDocument();
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

  /**
   * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
   * (verbatim, confirmed): "Concentradores disponibles"/"Tanques
   * disponibles" means REAL availability (total configured stock − active
   * rentals of that type). Proves the full wiring end-to-end: env vars →
   * `listActiveRentalItems` → `availability.ts` → `DashboardStats`'
   * `--success`/neutral-gray styling.
   */
  it("computes real availability from total-stock env vars minus active item quantities (business-owner confirmed rule)", async () => {
    vi.stubEnv("VITE_TOTAL_CONCENTRADORES", "5");
    vi.stubEnv("VITE_TOTAL_TANQUES", "0");
    listActiveRentals.mockResolvedValue([]);
    listActiveRentalItems.mockResolvedValue([
      { id: "i1", rental_id: "r1", item_type: "concentrator", quantity: 2 },
      { id: "i2", rental_id: "r2", item_type: "tank", quantity: 3 },
    ]);

    renderScreen();

    const concentradoresTile = await screen.findByRole("group", {
      name: "Concentradores disponibles: 3",
    });
    expect(within(concentradoresTile).getByText("3")).toHaveClass(
      "text-success",
    );

    // Total tanques = 0 → available is clamped to 0 regardless of active
    // count, and 0 always renders neutral gray, never as an error.
    const tanquesTile = screen.getByRole("group", {
      name: "Tanques disponibles: 0",
    });
    expect(within(tanquesTile).getByText("0")).toHaveClass(
      "text-muted-foreground",
    );
  });

  /**
   * Redesign Round 2, Batch 4. Confirms the exact default behavior when the
   * business owner hasn't configured stock yet: `VITE_TOTAL_CONCENTRADORES`/
   * `VITE_TOTAL_TANQUES` are completely unset (not stubbed at all here,
   * unlike the test above) — availability must default to 0, shown in
   * neutral gray, never as an error state.
   */
  it("defaults availability to 0 (neutral gray, not an error) when the total-stock env vars are completely unset", async () => {
    listActiveRentals.mockResolvedValue([]);
    listActiveRentalItems.mockResolvedValue([
      { id: "i1", rental_id: "r1", item_type: "concentrator", quantity: 2 },
    ]);

    renderScreen();

    const concentradoresTile = await screen.findByRole("group", {
      name: "Concentradores disponibles: 0",
    });
    expect(within(concentradoresTile).getByText("0")).toHaveClass(
      "text-muted-foreground",
    );
    expect(
      within(concentradoresTile).queryByText(/error/i),
    ).not.toBeInTheDocument();

    const tanquesTile = screen.getByRole("group", {
      name: "Tanques disponibles: 0",
    });
    expect(within(tanquesTile).getByText("0")).toHaveClass(
      "text-muted-foreground",
    );
  });

  /**
   * Redesign Round 2, Batch 4: the previous full "Requiere revisión"
   * section (duplicated RentalCards) is replaced with a single compact,
   * tappable banner — business owner's explicit go-ahead to simplify this
   * existing behavior, not just a color tweak.
   */
  it("shows a compact, tappable stale-rentals banner instead of a duplicated card section (CU2, Anexo A.3)", async () => {
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

    const banner = await screen.findByRole("button", {
      name: /1 renta requiere revisión/i,
    });
    expect(banner).toBeInTheDocument();
    // No more duplicated section/heading and no more duplicated card.
    expect(
      screen.queryByRole("heading", { name: "Requiere revisión" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Juan Pérez")).toHaveLength(1);
  });

  it("marks a stale rental's card with the --warning border token in the single unified list, not a hardcoded color", async () => {
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

    const name = await screen.findByText("Juan Pérez");
    expect(name.closest(".border-warning")).not.toBeNull();
    expect(name.closest(".border-amber-500")).toBeNull();
  });

  it("tapping the stale-rentals banner filters the list to only stale rentals; tapping again shows all again", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const recent = { id: "c2", name: "Ana López", phone: "5599998888" };

    listActiveRentals.mockResolvedValue([
      {
        id: "r-stale",
        folio: "R-000002",
        status: "ACTIVE",
        created: oldDate.toISOString(),
        initial_rent_amount: 1500,
        expand: { customer_id: juan },
      },
      {
        id: "r-fresh",
        folio: "R-000003",
        status: "ACTIVE",
        created: new Date().toISOString(),
        initial_rent_amount: 2000,
        expand: { customer_id: recent },
      },
    ]);
    const user = userEvent.setup();

    renderScreen();

    await screen.findByText("Ana López");
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();

    const banner = await screen.findByRole("button", {
      name: /1 renta requiere revisión/i,
    });
    await user.click(banner);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Ana López")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver todas/i }));

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(await screen.findByText("Ana López")).toBeInTheDocument();
  });

  it("does not show the stale-rentals banner when no rental is stale", async () => {
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
      screen.queryByRole("button", { name: /requiere revisión/i }),
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
   * Redesign Round 2, Batch 4 (business-owner brief, verbatim, decision
   * already confirmed — see this batch's own docblock in DashboardScreen):
   * the CTA is a pinned, always-visible bottom bar (not an inline scroll-
   * flow element) — this takes priority over the brief's literal DOM-order
   * wording for the CTA specifically. This is the presentational-change
   * exception this batch's own scope note allows: structural class
   * assertions, since there's genuinely nothing else to unit-test about a
   * CSS-only sticky/pinned layout.
   */
  it("renders 'Nueva renta' as a pinned, always-visible bottom bar (sticky bottom-0), separate from the scrollable content", async () => {
    listActiveRentals.mockResolvedValue([]);

    const { container } = renderScreen();

    await screen.findByText("No hay rentas activas todavía.");

    const ctaBar = container.querySelector(".sticky.bottom-0");
    expect(ctaBar).not.toBeNull();
    expect(
      within(ctaBar as HTMLElement).getByRole("link", { name: "Nueva renta" }),
    ).toBeInTheDocument();
  });

  it("gives the scrollable content enough bottom padding to clear the pinned CTA bar over the last RentalCard", async () => {
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

    const { container } = renderScreen();

    const searchInput = await screen.findByLabelText(
      "Buscar por folio, nombre o teléfono",
    );

    // pb-20 (80px) exactly clears the CTA bar's own rendered height: a
    // size="lg" Button (h-12 = 48px) inside a p-4 (16px×2 = 32px) wrapper =
    // 80px total. Not guessed — computed from the real Button/wrapper
    // classes below.
    const scrollableContent = container.querySelector(".pb-20");
    expect(scrollableContent).not.toBeNull();
    expect(scrollableContent?.contains(searchInput)).toBe(true);
    expect(scrollableContent?.className).not.toContain("sticky");
  });

  /**
   * Redesign layout-reorder batch (business-owner brief) content order,
   * updated for Batch 4: "1. Buscador prominente 2. Estadísticas compactas
   * 3. Indicador de rentas antiguas 4. Lista de rentas activas." The CTA is
   * deliberately NOT part of this in-flow order any more (see the pinned
   * bar test above) — decision #1, already confirmed by the business
   * owner, takes priority over the brief's literal DOM-order wording for
   * the CTA specifically.
   */
  it("orders content as: buscador, estadísticas, indicador de antiguas, lista (business-owner brief, Batch 4)", async () => {
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
    const statsTile = await screen.findByRole("group", {
      name: "Rentas activas: 1",
    });
    const banner = screen.getByRole("button", {
      name: /1 renta requiere revisión/i,
    });
    const listItem = screen.getByText("Folio: R-000001");

    function isBefore(a: Node, b: Node) {
      return Boolean(
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    expect(isBefore(searchInput, statsTile)).toBe(true);
    expect(isBefore(statsTile, banner)).toBe(true);
    expect(isBefore(banner, listItem)).toBe(true);
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

    it("hides the stats row, stale banner, and active-rentals list while a search query is active — one clear list at a time, not two stacked", async () => {
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
      await screen.findByRole("group", { name: "Rentas activas: 1" });
      expect(
        await screen.findByRole("button", { name: /1 renta requiere revisión/i }),
      ).toBeInTheDocument();

      await user.type(
        screen.getByLabelText("Buscar por folio, nombre o teléfono"),
        "184",
      );

      expect(await screen.findByText("Folio: R-000184")).toBeInTheDocument();
      expect(
        screen.queryByRole("group", { name: "Rentas activas: 1" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Folio: R-000001")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /requiere revisión/i }),
      ).not.toBeInTheDocument();
    });
  });
});
