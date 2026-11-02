import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardStats } from "@/components/DashboardStats";

describe("DashboardStats (card horizontal de Rentas Activas)", () => {
  it("renders active rentals count and title", () => {
    render(<DashboardStats activeRentalsCount={7} />);

    expect(screen.getByRole("group", { name: "Rentas activas: 7" })).toBeInTheDocument();
    expect(screen.getByText("Rentas activas")).toBeInTheDocument();
    expect(screen.getByText("Equipos actualmente en renta")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByTestId("stat-icon-rentas-activas")).toBeInTheDocument();
  });

  it("renders 0 in plain text without crashing", () => {
    render(<DashboardStats activeRentalsCount={0} />);

    expect(screen.getByRole("group", { name: "Rentas activas: 0" })).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
