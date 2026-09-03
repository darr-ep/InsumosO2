import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ClientesScreen } from "@/screens/clientes/ClientesScreen";
import { DataCacheProvider } from "@/app/DataCacheContext";

const listCustomers = vi.fn();
const searchCustomers = vi.fn();
const getCustomer = vi.fn();
const getCredentialPhotoUrl = vi.fn();
const updateCustomerCredentialPhoto = vi.fn();
const listRentalsForCustomer = vi.fn();
const listActiveRentals = vi.fn();
const listActiveRentalItems = vi.fn();
const getBusinessSettings = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  listCustomers: (...args: unknown[]) => listCustomers(...args),
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  getCustomer: (...args: unknown[]) => getCustomer(...args),
  getCredentialPhotoUrl: (...args: unknown[]) => getCredentialPhotoUrl(...args),
  updateCustomerCredentialPhoto: (...args: unknown[]) =>
    updateCustomerCredentialPhoto(...args),
}));

// DataCacheContext's `refreshRentals` (shared with DashboardScreen) pulls in
// `listActiveRentalItems`/`getBusinessSettings` too, even though this screen
// itself only ever reads `rentals` — without these mocked the context's
// background rentals load rejects with a real TypeError (undefined mock).
vi.mock("@/data/rentals.repo", () => ({
  listRentalsForCustomer: (...args: unknown[]) => listRentalsForCustomer(...args),
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  listActiveRentalItems: (...args: unknown[]) => listActiveRentalItems(...args),
}));

vi.mock("@/data/settings.repo", () => ({
  getBusinessSettings: (...args: unknown[]) => getBusinessSettings(...args),
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <DataCacheProvider>
        <ClientesScreen />
      </DataCacheProvider>
    </MemoryRouter>,
  );
}

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };
const ana = { id: "c2", name: "Ana Ruiz", phone: "5522223333" };

/**
 * Clientes screen — Redesign Round 2, Batch 2 (business-owner brief,
 * verbatim): "Debe existir como pantalla real porque un cliente puede
 * tener múltiples rentas y queremos evitar volver a capturar sus datos.
 * Debe ser una lista simple con búsqueda. Al seleccionar un cliente,
 * mostrar sus datos, rentas activas, historial asociado y acceso a su
 * credencial." Not a new business capability — customer search/detail
 * already existed (`CustomerPicker`/`CustomerDetailSheet`); this is a new
 * entry point mirroring HistorialScreen's fetch/loading/error/empty-state
 * pattern layered with DashboardScreen's idle-list-vs-active-search split.
 */
describe("ClientesScreen (Redesign Round 2, Batch 2 — Clientes screen)", () => {
  beforeEach(() => {
    listCustomers.mockReset();
    searchCustomers.mockReset();
    getCustomer.mockReset();
    getCredentialPhotoUrl.mockReset();
    updateCustomerCredentialPhoto.mockReset();
    listRentalsForCustomer.mockReset();
    listActiveRentals.mockReset();
    listActiveRentalItems.mockReset();
    getBusinessSettings.mockReset();
    // Redesign — UX/UI pass (active-rental-count badge): safe default so
    // every pre-existing test in this file (which doesn't care about the
    // badge) doesn't have to know about this new fetch.
    listActiveRentals.mockResolvedValue([]);
    listActiveRentalItems.mockResolvedValue([]);
    getBusinessSettings.mockResolvedValue({
      id: "s1",
      total_concentradores: 0,
      total_tanques: 0,
    });
  });

  it("shows a header without a back arrow (Clientes is a primary destination, not a drill-down screen)", async () => {
    listCustomers.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Clientes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Volver" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cuenta" })).toBeInTheDocument();
  });

  it("shows a loading state before the customer list arrives", () => {
    listCustomers.mockReturnValue(new Promise(() => {}));

    renderScreen();

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows every customer, sorted by the repo, in the idle state", async () => {
    listCustomers.mockResolvedValue([juan, ana]);

    renderScreen();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("5512345678")).toBeInTheDocument();
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
    expect(screen.getByText("5522223333")).toBeInTheDocument();
  });

  it("shows an active-rental-count badge per customer, singular/plural, and hides it at zero (Redesign — UX/UI pass, business-owner request)", async () => {
    listCustomers.mockResolvedValue([juan, ana]);
    listActiveRentals.mockResolvedValue([
      { id: "r1", customer_id: "c1" },
      { id: "r2", customer_id: "c1" },
      { id: "r3", customer_id: "c2" },
    ]);

    renderScreen();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("2 activas")).toBeInTheDocument();
    expect(screen.getByText("1 activa")).toBeInTheDocument();
  });

  it("shows an empty state when there are no customers yet", async () => {
    listCustomers.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByText("Aún no hay clientes registrados."),
    ).toBeInTheDocument();
  });

  it("shows an error message when loading the idle list fails", async () => {
    listCustomers.mockRejectedValue(new Error("network down"));

    renderScreen();

    expect(
      await screen.findByText("No se pudo cargar la lista de clientes."),
    ).toBeInTheDocument();
  });

  it("replaces the idle list with debounced search results while a query is active", async () => {
    listCustomers.mockResolvedValue([juan]);
    searchCustomers.mockResolvedValue([ana]);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Juan Pérez");

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "Ana",
    );

    expect(await screen.findByText("Ana Ruiz")).toBeInTheDocument();
    expect(screen.queryByText("Juan Pérez")).not.toBeInTheDocument();
  });

  it("shows 'sin resultados' when a search matches nothing", async () => {
    listCustomers.mockResolvedValue([juan]);
    searchCustomers.mockResolvedValue([]);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Juan Pérez");

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "zzz",
    );

    expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
  });

  it("shows a search error and does not crash when the search fails", async () => {
    listCustomers.mockResolvedValue([juan]);
    searchCustomers.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Juan Pérez");

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "Ana",
    );

    expect(
      await screen.findByText("No se pudo buscar. Intenta de nuevo."),
    ).toBeInTheDocument();
  });

  it("opens CustomerDetailSheet with clearly separate 'Rentas activas' and 'Historial' sections when a customer row is tapped", async () => {
    listCustomers.mockResolvedValue([juan]);
    getCustomer.mockResolvedValue(juan);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000002", status: "ACTIVE", initial_rent_amount: 2800 },
      { id: "r2", folio: "R-000001", status: "RETURNED", initial_rent_amount: 1500 },
    ]);
    const user = userEvent.setup();

    renderScreen();
    await user.click(await screen.findByText("Juan Pérez"));

    expect(getCustomer).toHaveBeenCalledWith("c1");
    expect(
      await screen.findByRole("heading", { name: "Rentas activas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Historial" }),
    ).toBeInTheDocument();
  });
});
