import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";

const listActiveRentals = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
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
    listActiveRentals.mockReset();
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

  it("links to Nueva renta (§16.6: botón 'Nueva renta')", async () => {
    listActiveRentals.mockResolvedValue([]);

    renderScreen();

    await screen.findByText("No hay rentas activas todavía.");
    expect(
      screen.getByRole("link", { name: "Nueva renta" }),
    ).toHaveAttribute("href", "/nueva-renta");
  });
});
