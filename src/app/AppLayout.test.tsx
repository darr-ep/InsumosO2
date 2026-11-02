import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";
import { DataCacheProvider } from "@/app/DataCacheContext";

// AppLayout now imports and renders the real DashboardScreen/ClientesScreen
// directly (see AppLayout.tsx's own docblock — the swipeable-panels
// redesign), not an arbitrary routed `<Outlet/>` child, so this file needs
// the same minimal data-layer mocking those screens' own tests use, just
// enough to render without a real network call.
const listActiveRentals = vi.fn();
const listReturnedRentals = vi.fn();
const listActiveRentalItems = vi.fn();
const searchRentals = vi.fn();
const getBusinessSettings = vi.fn();
const searchCustomers = vi.fn();
const listCustomers = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  listReturnedRentals: (...args: unknown[]) => listReturnedRentals(...args),
  listActiveRentalItems: (...args: unknown[]) => listActiveRentalItems(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
}));

vi.mock("@/data/settings.repo", () => ({
  getBusinessSettings: (...args: unknown[]) => getBusinessSettings(...args),
  updateBusinessSettings: vi.fn(),
}));

vi.mock("@/data/customers.repo", () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
}));

function renderLayout(initialPath = "/dashboard") {
  return render(
    <DataCacheProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={null} />
            <Route path="/clientes" element={null} />
          </Route>
          {/* Sibling of AppLayout's own routes, not nested under it — the
              center nav CTA links here directly, and this file has no other
              coverage of RentalNewScreen, so a bare marker is enough to
              prove the navigation actually happened. */}
          <Route path="/nueva-renta" element={<div>Nueva renta screen</div>} />
        </Routes>
      </MemoryRouter>
    </DataCacheProvider>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BUSINESS_NAME", "");
    listActiveRentals.mockReset().mockResolvedValue([]);
    listReturnedRentals.mockReset().mockResolvedValue([]);
    listActiveRentalItems.mockReset().mockResolvedValue([]);
    getBusinessSettings.mockReset().mockResolvedValue({
      id: "s1",
      total_concentradores: 0,
      total_tanques: 0,
    });
    searchRentals.mockReset().mockResolvedValue([]);
    searchCustomers.mockReset();
    listCustomers.mockReset().mockResolvedValue([]);
  });

  /**
   * Post-launch swipe feature (business-owner request), REVISED: Inicio and
   * Clientes are swipeable, with a header/search/bottom-nav that never
   * visibly flash mid-swipe. Header+search are shared, single instances
   * rendered once here (not duplicated per screen anymore — see
   * `AppLayout.tsx`'s own docblock for why this replaced the first version
   * of the feature) — so there is exactly ONE heading and ONE search input
   * at any time, its text switching with `activePanel`. What DOES stay
   * permanently mounted, and what this test proves instead, is each
   * screen's own BODY content (below the shared header): Dashboard's own
   * stats tile and Clientes' own empty state both exist in the DOM at
   * once, regardless of which tab is "active" — proof the swipeable panels
   * never unmount each other.
   */
  it("keeps both Inicio and Clientes bodies permanently mounted side by side (no remount/flash on swipe)", async () => {
    renderLayout("/dashboard");

    expect(
      await screen.findByText("No hay rentas activas todavía."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Aún no hay clientes registrados."),
    ).toBeInTheDocument();
    // Exactly one shared header/account button/search input, not one per
    // screen — the whole point of lifting them into AppLayout.
    expect(screen.getByRole("button", { name: "Cuenta" })).toBeInTheDocument();
    expect(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
    ).toBeInTheDocument();
  });

  it("shows only the Inicio title on /dashboard (no Clientes title present)", async () => {
    renderLayout("/dashboard");

    expect(
      await screen.findByRole("heading", { name: "Inicio" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Clientes" }),
    ).not.toBeInTheDocument();
  });

  it("shows only the Clientes title on /clientes (no Inicio title present)", async () => {
    renderLayout("/clientes");

    const clientesHeading = await screen.findByRole("heading", {
      name: "Clientes",
    });
    expect(clientesHeading.className).toContain("font-bold");
    expect(
      screen.queryByRole("heading", { name: "Inicio" }),
    ).not.toBeInTheDocument();
  });

  /**
   * design-fidelity Slice D2: the bottom nav grew from a 2-slot to a
   * 3-slot structure — two `flex-1` destination NavLinks plus a
   * non-flexing center "Nueva renta" CTA. This test is the direct
   * successor of the pre-D2 "renders exactly 2 nav items" assertion,
   * updated in place (same pattern as prior slices' superseded-test
   * rewrites) rather than left alongside a now-false assertion.
   */
  it("renders exactly 3 interactive nav elements — Inicio, the Nueva renta CTA, and Clientes — with the correct hrefs", async () => {
    renderLayout();
    await screen.findByText("No hay rentas activas todavía.");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    const links = within(nav).getAllByRole("link");

    expect(links).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      within(nav).getByRole("link", { name: "Nueva renta" }),
    ).toHaveAttribute("href", "/nueva-renta");
    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toHaveAttribute("href", "/clientes");
  });

  it.each(["/dashboard", "/clientes"] as const)(
    "shows the center Nueva renta CTA in the nav from %s",
    async (path) => {
      renderLayout(path);
      const nav = await screen.findByRole("navigation", {
        name: "Navegación principal",
      });

      expect(
        within(nav).getByRole("link", { name: "Nueva renta" }),
      ).toHaveAttribute("href", "/nueva-renta");
    },
  );

  it("navigates to /nueva-renta when the center CTA is tapped", async () => {
    const user = userEvent.setup();
    renderLayout("/dashboard");
    await screen.findByText("No hay rentas activas todavía.");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    await user.click(within(nav).getByRole("link", { name: "Nueva renta" }));

    expect(await screen.findByText("Nueva renta screen")).toBeInTheDocument();
  });

  it("marks Inicio as the active tab when the current route is /dashboard", async () => {
    renderLayout("/dashboard");
    await screen.findByText("No hay rentas activas todavía.");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks Clientes as the active tab when the current route is /clientes", async () => {
    renderLayout("/clientes");
    await screen.findByRole("heading", { name: "Clientes" });

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Inicio" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("updates the active tab and header title when Clientes is tapped, without unmounting Inicio's own body content", async () => {
    const user = userEvent.setup();
    renderLayout("/dashboard");
    await screen.findByText("No hay rentas activas todavía.");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    await user.click(within(nav).getByRole("link", { name: "Clientes" }));

    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Inicio" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      await screen.findByRole("heading", { name: "Clientes" }),
    ).toBeInTheDocument();
    // Still mounted — tapping the tab scrolls, it never routes exclusively.
    expect(
      screen.getByText("No hay rentas activas todavía."),
    ).toBeInTheDocument();
  });
});
