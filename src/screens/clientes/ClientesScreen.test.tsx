import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ClientesScreen } from "@/screens/clientes/ClientesScreen";

const listCustomers = vi.fn();
const searchCustomers = vi.fn();
const getCustomer = vi.fn();
const getCredentialPhotoUrl = vi.fn();
const updateCustomerCredentialPhoto = vi.fn();
const listRentalsForCustomer = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  listCustomers: (...args: unknown[]) => listCustomers(...args),
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  getCustomer: (...args: unknown[]) => getCustomer(...args),
  getCredentialPhotoUrl: (...args: unknown[]) => getCredentialPhotoUrl(...args),
  updateCustomerCredentialPhoto: (...args: unknown[]) =>
    updateCustomerCredentialPhoto(...args),
}));

vi.mock("@/data/rentals.repo", () => ({
  listRentalsForCustomer: (...args: unknown[]) => listRentalsForCustomer(...args),
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <ClientesScreen />
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
