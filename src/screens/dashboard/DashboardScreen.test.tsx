import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { DataCacheProvider } from "@/app/DataCacheContext";
import { formatDateDisplay } from "@/lib/formatDate";

const listActiveRentals = vi.fn();
const listReturnedRentals = vi.fn();
const listActiveRentalItems = vi.fn();
const searchRentals = vi.fn();
const getRental = vi.fn();
const listItemsForRental = vi.fn();
const listPaymentsForRental = vi.fn();
const listActiveRentalsPayments = vi.fn();
const getBusinessSettings = vi.fn();
const updateBusinessSettings = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  listReturnedRentals: (...args: unknown[]) => listReturnedRentals(...args),
  listActiveRentalItems: (...args: unknown[]) => listActiveRentalItems(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
  listActiveRentalsPayments: (...args: unknown[]) => listActiveRentalsPayments(...args),
}));

// Feature: Runtime-Editable Total Stock — replaces the old
// VITE_TOTAL_CONCENTRADORES/VITE_TOTAL_TANQUES env-var stubbing below.
vi.mock("@/data/settings.repo", () => ({
  getBusinessSettings: (...args: unknown[]) => getBusinessSettings(...args),
  updateBusinessSettings: (...args: unknown[]) => updateBusinessSettings(...args),
}));

// Post-launch feature (Inicio/Clientes swipe): `DashboardScreen` no longer
// owns/renders its own `SearchBar` — `query` arrives as a plain controlled
// prop from `AppLayout` now (see `DashboardScreen.tsx`'s own docblock).
// `setQuery` here re-renders with a new `query`, standing in for what
// typing into the now-shared, now-external `SearchBar` would do — the
// debounce/search-call behavior this triggers is identical either way.
function renderScreen(query = "") {
  const utils = render(
    <MemoryRouter>
      <DataCacheProvider>
        <DashboardScreen query={query} />
      </DataCacheProvider>
    </MemoryRouter>,
  );
  return {
    ...utils,
    setQuery: (next: string) =>
      utils.rerender(
        <MemoryRouter>
          <DataCacheProvider>
            <DashboardScreen query={next} />
          </DataCacheProvider>
        </MemoryRouter>,
      ),
  };
}

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };

describe("DashboardScreen (§16.3, §16.4, §16.6, Anexo A.3, CU2)", () => {
  beforeEach(() => {
    listActiveRentals.mockReset().mockResolvedValue([]);
    listReturnedRentals.mockReset().mockResolvedValue([]);
    listActiveRentalItems.mockReset().mockResolvedValue([]);
    searchRentals.mockReset();
    getRental.mockReset();
    listItemsForRental.mockReset();
    listPaymentsForRental.mockReset();
    listActiveRentalsPayments.mockReset().mockResolvedValue([]);
    // Feature: Runtime-Editable Total Stock — matches the migration's own
    // seeded default (0/0). Most tests below don't care about stock; tests
    // that need real math override this explicitly.
    getBusinessSettings.mockReset().mockResolvedValue({
      id: "s1",
      total_concentradores: 0,
      total_tanques: 0,
    });
    updateBusinessSettings.mockReset();
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
        created: new Date().toISOString(),
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Rentas activas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("R-000001")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("shows returned rentals underneath the active rentals when present", async () => {
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
    listReturnedRentals.mockResolvedValue([
      {
        id: "r2",
        folio: "R-000002",
        status: "RETURNED",
        created: "2026-08-10 10:00:00.000Z",
        returned_at: "2026-08-25 10:00:00.000Z",
        initial_rent_amount: 1500,
        expand: { customer_id: { id: "c2", name: "María López", phone: "5587654321" } },
      },
    ]);

    renderScreen();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(await screen.findByText("María López")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Rentas activas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Rentas devueltas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("R-000002")).toBeInTheDocument();
    expect(screen.getByText("Devuelta")).toBeInTheDocument();
  });

  it("shows the customer's phone on each active-rental card (Redesign — UX/UI pass, free from already-expanded data)", async () => {
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

    expect(await screen.findByText("5512345678")).toBeInTheDocument();
  });

  it("shows a product-type icon on a card whose items are all the same type, derived from the already-fetched active items (no new fetch)", async () => {
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
    listActiveRentalItems.mockResolvedValue([
      { id: "i1", rental_id: "r1", item_type: "concentrator", quantity: 2 },
    ]);

    renderScreen();

    const folio = await screen.findByText("R-000001");
    expect(folio.parentElement?.querySelector("svg")).toBeInTheDocument();
  });

  it("shows an empty state when there are no active rentals (CU2)", async () => {
    listActiveRentals.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByText("No hay rentas activas todavía."),
    ).toBeInTheDocument();
  });

  it("renders the active rentals header count", async () => {
    listActiveRentals.mockResolvedValue([
      {
        id: "r1",
        folio: "R-000001",
        status: "ACTIVE",
        created: new Date().toISOString(),
        initial_rent_amount: 2800,
        expand: { customer_id: juan },
      },
    ]);

    renderScreen();

    const heading = await screen.findByRole("heading", {
      name: "Rentas activas",
    });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
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

  it("marks a stale rental's card with the Revisión badge in yellow (warning-soft)", async () => {
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

    const badge = await screen.findByText("Revisión");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-warning-soft");
    expect(badge).toHaveClass("text-warning-soft-foreground");
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

  // Post-audit bugfix (design-fidelity, obs #2228 batch 11): pencil frame
  // `XLTdc` ("Insumos O2 - Inicio") shows the "Rentas activas" count pill
  // pinned to the FAR right edge of the section header row, clearly
  // separated from the label — not squeezed directly next to the text.
  it("positions the 'Rentas activas' count pill on the opposite side of the header row, not squeezed next to the label", async () => {
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

    const heading = await screen.findByRole("heading", {
      name: "Rentas activas",
    });
    const headerRow = heading.parentElement;

    expect(headerRow).toHaveClass("justify-between");
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

  // Post-audit bugfix (design-fidelity, obs #2228 batch): DashboardScreen
  // used to render its OWN sticky-bottom "Nueva renta" CTA — a leftover
  // from before the bottom-nav's floating pill CTA existed (added in
  // design-fidelity Slice D2, `AppLayout.tsx`). The bottom-nav pill is now
  // the single correct "+ Nueva renta" entry point app-wide, so this
  // screen must NOT render a duplicate of its own.
  it("does not render its own 'Nueva renta' CTA (the bottom-nav pill is the single entry point, Slice D2)", async () => {
    listActiveRentals.mockResolvedValue([]);

    renderScreen();

    await screen.findByText("No hay rentas activas todavía.");
    expect(
      screen.queryByRole("link", { name: "Nueva renta" }),
    ).not.toBeInTheDocument();
  });

  it("does not add compensating bottom padding for the pinned CTA bar (it's a flex sibling, not an overlay — see DashboardScreen.tsx's docblock correction)", async () => {
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

    await screen.findByRole("heading", { name: "Rentas activas" });

    // The CTA bar (`sticky bottom-0 shrink-0`) is a flex sibling of the
    // scrollable content, not an overlay — it always reserves its own
    // 80px of layout space regardless of padding on the content block
    // (same pattern AppLayout.tsx's bottom nav already documents). Extra
    // `pb-20` here was pure double-spacing, not overlap protection.
    const scrollableContent = container.querySelector(".flex-1.flex-col.gap-6");
    expect(scrollableContent).not.toBeNull();
    expect(scrollableContent?.className).not.toContain("pb-20");
  });

  /**
   * Redesign layout-reorder batch (business-owner brief) content order,
   * updated for Batch 4: "1. Buscador prominente 2. Estadísticas compactas
   * 3. Indicador de rentas antiguas 4. Lista de rentas activas." The CTA is
   * deliberately NOT part of this in-flow order any more (see the pinned
   * bar test above) — decision #1, already confirmed by the business
   * owner, takes priority over the brief's literal DOM-order wording for
   * the CTA specifically.
   *
   * Post-launch (Inicio/Clientes swipe): "buscador" is no longer part of
   * THIS screen's own content order — it's shared, fixed chrome rendered
   * once in `AppLayout`, above the whole swipeable panel (see
   * `AppLayout.tsx`'s own docblock), not inside `DashboardScreen`'s tree at
   * all anymore. This test only verifies what `DashboardScreen` itself
   * still orders: encabezado, indicador de antiguas, lista.
   */
  it("orders content as: encabezado, indicador de antiguas, lista (business-owner brief, Batch 4 — buscador now lives in AppLayout)", async () => {
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

    const heading = await screen.findByRole("heading", {
      name: "Rentas activas",
    });
    const banner = screen.getByRole("button", {
      name: /1 renta requiere revisión/i,
    });
    const listItem = screen.getByText("R-000001");

    function isBefore(a: Node, b: Node) {
      return Boolean(
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    expect(isBefore(heading, banner)).toBe(true);
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
          initial_rent_amount: 2800,
          expand: { customer_id: juan },
        },
      ]);

      const { setQuery } = renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      setQuery("184");

      expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
      expect(screen.getByText("R-000184")).toBeInTheDocument();
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
          initial_rent_amount: 2800,
          expand: { customer_id: juan },
        },
      ]);

      const { setQuery } = renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      setQuery("184");

      expect(await screen.findByText("Devuelta")).toBeInTheDocument();
    });

    // Post-audit bugfix (design-fidelity, obs #2228 batch 11): search-result
    // cards render the SAME `RentalCard` component as the main list, but
    // without the "Inicio {fecha}" children the main list's card passes —
    // a real divergent-props bug (`searchRentals` DOES return `created`,
    // same as `listActiveRentals`; the JSX for the search branch just never
    // rendered it). This must show the exact same start-date line the main
    // list shows for an identical rental.
    it("shows the same start-date line ('Inicio {fecha}') on a search result as the main list shows for an identical rental (root cause: search branch never passed the date as RentalCard children)", async () => {
      const created = "2026-08-01T10:00:00.000Z";
      const expectedDate = formatDateDisplay(created);

      searchRentals.mockResolvedValue([
        {
          id: "r1",
          folio: "R-000184",
          status: "ACTIVE",
          created,
          initial_rent_amount: 2800,
          expand: { customer_id: juan },
        },
      ]);

      const { setQuery } = renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      setQuery("184");

      expect(
        await screen.findByText(`Inicio ${expectedDate}`),
      ).toBeInTheDocument();
    });

    it("shows 'sin resultados' when nothing matches (CU3's last scenario)", async () => {
      searchRentals.mockResolvedValue([]);

      const { setQuery } = renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      setQuery("xyz123");

      expect(await screen.findByText(/sin resultados/i)).toBeInTheDocument();
    });

    it("shows an error message when the search fails", async () => {
      searchRentals.mockRejectedValue(new Error("network down"));

      const { setQuery } = renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      setQuery("184");

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
          initial_rent_amount: 2800,
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

      const { setQuery } = renderScreen();
      await screen.findByText("No hay rentas activas todavía.");

      setQuery("184");
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
          initial_rent_amount: 2800,
          expand: { customer_id: juan },
        },
      ]);
      const { setQuery } = renderScreen();
      await screen.findByRole("heading", { name: "Rentas activas" });
      expect(
        await screen.findByRole("button", { name: /1 renta requiere revisión/i }),
      ).toBeInTheDocument();

      setQuery("184");

      expect(await screen.findByText("R-000184")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Rentas activas" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("R-000001")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /requiere revisión/i }),
      ).not.toBeInTheDocument();
    });
  });
});
