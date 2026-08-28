import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DashboardStats } from "@/components/DashboardStats";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "estadísticas compactas: Rentas activas,
 * Concentradores disponibles y Tanques disponibles. Los valores 0 deben
 * mostrarse en gris neutro, no como error." Explicit styling rule (already
 * decided, not re-asked): zero renders `text-muted-foreground`; a non-zero
 * availability tile can use `--success` (green, "hay stock disponible" is a
 * positive state); "Rentas activas" is a neutral operational count and
 * stays neutral-weighted (`text-foreground`) regardless of its value — it
 * never gets promoted to `text-success`, since it's neither a good nor a
 * bad state.
 */

describe("DashboardStats (compact 3-tile stats row)", () => {
  it("renders all three tiles with their labels", () => {
    render(
      <DashboardStats
        activeRentalsCount={3}
        concentradoresDisponibles={5}
        tanquesDisponibles={2}
      />,
    );

    expect(screen.getByText("Rentas activas")).toBeInTheDocument();
    expect(screen.getByText("Concentradores disponibles")).toBeInTheDocument();
    expect(screen.getByText("Tanques disponibles")).toBeInTheDocument();
  });

  it("shows a zero availability value in neutral gray, not as an error", () => {
    render(
      <DashboardStats
        activeRentalsCount={0}
        concentradoresDisponibles={0}
        tanquesDisponibles={4}
      />,
    );

    const concentradoresTile = screen.getByRole("group", {
      name: "Concentradores disponibles: 0",
    });
    const value = within(concentradoresTile).getByText("0");

    expect(value).toHaveClass("text-muted-foreground");
    expect(value).not.toHaveClass("text-success");
  });

  it("shows a non-zero availability value with the --success token", () => {
    render(
      <DashboardStats
        activeRentalsCount={0}
        concentradoresDisponibles={0}
        tanquesDisponibles={4}
      />,
    );

    const tanquesTile = screen.getByRole("group", {
      name: "Tanques disponibles: 4",
    });
    const value = within(tanquesTile).getByText("4");

    expect(value).toHaveClass("text-success");
    expect(value).not.toHaveClass("text-muted-foreground");
  });

  it("keeps 'Rentas activas' neutral-weighted regardless of value — never green, even when non-zero", () => {
    render(
      <DashboardStats
        activeRentalsCount={7}
        concentradoresDisponibles={1}
        tanquesDisponibles={1}
      />,
    );

    const activeTile = screen.getByRole("group", {
      name: "Rentas activas: 7",
    });
    const value = within(activeTile).getByText("7");

    expect(value).toHaveClass("text-foreground");
    expect(value).not.toHaveClass("text-success");
    expect(value).not.toHaveClass("text-muted-foreground");
  });

  it("keeps 'Rentas activas' the exact same neutral class when it's zero too — no error/muted treatment either", () => {
    render(
      <DashboardStats
        activeRentalsCount={0}
        concentradoresDisponibles={1}
        tanquesDisponibles={1}
      />,
    );

    const activeTile = screen.getByRole("group", {
      name: "Rentas activas: 0",
    });
    const value = within(activeTile).getByText("0");

    expect(value).toHaveClass("text-foreground");
    expect(value).not.toHaveClass("text-muted-foreground");
  });
});
