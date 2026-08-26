import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app/App";

// Both real tabs behind the nav now fetch data on mount (DashboardScreen,
// task 2.5; SearchScreen, task 2.6) — mocked here so this smoke test stays
// a fast, network-free check of the route wiring itself (§16.5), not a
// screen-level test (those live in each screen's own *.test.tsx).
const listActiveRentals = vi.fn();
const searchRentals = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
}));

describe("App", () => {
  beforeEach(() => {
    listActiveRentals.mockReset().mockResolvedValue([]);
    searchRentals.mockReset().mockResolvedValue([]);
  });

  it("redirects to the Dashboard tab and renders the 3-tab nav (§16.5)", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    expect(nav).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: /Dashboard/ }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: /Nueva renta/ }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: /Buscar/ }),
    ).toBeInTheDocument();
  });

  it("wires the Dashboard tab's real content, not the Phase 0 placeholder (task 2.5/2.7)", async () => {
    render(<App />);

    expect(
      await screen.findByText("No hay rentas activas todavía."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
  });

  it("wires the Buscar tab's real content, not the Phase 0 placeholder (task 2.6/2.7)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("No hay rentas activas todavía.");
    await user.click(screen.getByRole("link", { name: /Buscar/ }));

    expect(
      await screen.findByLabelText("Buscar por folio, nombre o teléfono"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
  });
});
