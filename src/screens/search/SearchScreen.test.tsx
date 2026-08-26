import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchScreen } from "@/screens/search/SearchScreen";

const searchRentals = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  searchRentals: (...args: unknown[]) => searchRentals(...args),
}));

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };

describe("SearchScreen (§7.4, §16.9, CU3)", () => {
  beforeEach(() => {
    searchRentals.mockReset();
  });

  it("shows nothing before typing anything", () => {
    render(<SearchScreen />);

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

    render(<SearchScreen />);

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

    render(<SearchScreen />);

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "xyz123",
    );

    expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
  });

  it("shows an error message when the search fails", async () => {
    searchRentals.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(<SearchScreen />);

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "184",
    );

    expect(
      await screen.findByText("No se pudo buscar. Intenta de nuevo."),
    ).toBeInTheDocument();
  });
});
