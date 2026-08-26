import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SearchScreen } from "@/screens/search/SearchScreen";

const searchRentals = vi.fn();
const getRental = vi.fn();
const listItemsForRental = vi.fn();
const listPaymentsForRental = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  searchRentals: (...args: unknown[]) => searchRentals(...args),
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
}));

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };

function renderScreen() {
  return render(
    <MemoryRouter>
      <SearchScreen />
    </MemoryRouter>,
  );
}

describe("SearchScreen (§7.4, §16.9, CU3)", () => {
  beforeEach(() => {
    searchRentals.mockReset();
    getRental.mockReset();
    listItemsForRental.mockReset();
    listPaymentsForRental.mockReset();
  });

  it("shows nothing before typing anything", () => {
    renderScreen();

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

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "184",
    );
    await user.click(await screen.findByText("Juan Pérez"));

    expect(
      await screen.findByRole("heading", { name: "Renta R-000184" }),
    ).toBeInTheDocument();
  });
});
