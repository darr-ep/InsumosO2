import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardStats } from "@/components/DashboardStats";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure), superseded by a later
 * business-owner request: availability now signals urgency by color —
 * `0` is `text-destructive` (out of stock), `1` is `text-warning` (running
 * low), `2+` is `text-success` ("hay stock disponible"). "Rentas activas" is
 * a neutral operational count and stays neutral-weighted (`text-foreground`)
 * regardless of its value — it never gets promoted/demoted by this scale,
 * since it's neither a good nor a bad state.
 *
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced): the two availability tiles are now
 * tap-to-edit — tapping either opens a Dialog pre-filled with the current
 * CONFIGURED TOTAL (not the computed availability number shown on the
 * tile), calling `updateBusinessSettings` on save. Both increasing and
 * decreasing go through the exact same code path (business owner,
 * verbatim: "tanto para aumentar como disminuir") — both get a real test
 * below. "Rentas activas" stays a plain, non-tappable count.
 */

const updateBusinessSettings = vi.fn();
vi.mock("@/data/settings.repo", () => ({
  updateBusinessSettings: (...args: unknown[]) => updateBusinessSettings(...args),
}));

function renderStats(
  overrides: Partial<React.ComponentProps<typeof DashboardStats>> = {},
) {
  const onSettingsUpdated = vi.fn();
  render(
    <DashboardStats
      activeRentalsCount={3}
      concentradoresDisponibles={5}
      tanquesDisponibles={2}
      totalConcentradores={8}
      totalTanques={2}
      onSettingsUpdated={onSettingsUpdated}
      {...overrides}
    />,
  );
  return { onSettingsUpdated };
}

describe("DashboardStats (compact 3-tile stats row)", () => {
  beforeEach(() => {
    updateBusinessSettings.mockReset();
  });

  it("renders all three tiles with their labels", () => {
    renderStats();

    expect(screen.getByText("Rentas activas")).toBeInTheDocument();
    expect(screen.getByText("Concentradores disponibles")).toBeInTheDocument();
    expect(screen.getByText("Tanques disponibles")).toBeInTheDocument();
  });

  // Post-audit bugfix (design-fidelity, obs #2228 batch 11): pencil frame
  // `XLTdc` ("Insumos O2 - Inicio") shows the 3 stat tiles as white cards
  // against the gray page background (design obs #2224 §C4: "Stat cards
  // 110×112, rounded-[14px] p-[14px] gap-[7px] bg-card") — the tiles here
  // only had `border`, no `bg-card`, so they blended into the page.
  it("gives all three tiles a white (bg-card) surface, per the design frame", () => {
    renderStats();

    const activeTile = screen.getByRole("group", { name: "Rentas activas: 3" });
    const concentradoresTile = screen.getByRole("group", {
      name: "Concentradores disponibles: 5",
    });
    const tanquesTile = screen.getByRole("group", {
      name: "Tanques disponibles: 2",
    });

    expect(activeTile).toHaveClass("bg-card");
    expect(concentradoresTile).toHaveClass("bg-card");
    expect(tanquesTile).toHaveClass("bg-card");
  });

  it("shows a zero availability value in destructive red (out of stock)", () => {
    renderStats({ concentradoresDisponibles: 0, tanquesDisponibles: 4 });

    const concentradoresTile = screen.getByRole("group", {
      name: "Concentradores disponibles: 0",
    });
    const value = within(concentradoresTile).getByText("0");

    expect(value).toHaveClass("text-destructive");
    expect(value).not.toHaveClass("text-success");
    expect(value).not.toHaveClass("text-warning");
  });

  it("shows an availability value of exactly 1 in warning yellow (running low)", () => {
    renderStats({ concentradoresDisponibles: 1, tanquesDisponibles: 4 });

    const concentradoresTile = screen.getByRole("group", {
      name: "Concentradores disponibles: 1",
    });
    const value = within(concentradoresTile).getByText("1");

    expect(value).toHaveClass("text-warning");
    expect(value).not.toHaveClass("text-success");
    expect(value).not.toHaveClass("text-destructive");
  });

  it("shows an availability value of 2 or more with neutral text-foreground", () => {
    renderStats({
      activeRentalsCount: 0,
      concentradoresDisponibles: 0,
      tanquesDisponibles: 4,
    });

    const tanquesTile = screen.getByRole("group", {
      name: "Tanques disponibles: 4",
    });
    const value = within(tanquesTile).getByText("4");

    expect(value).toHaveClass("text-foreground");
    expect(value).not.toHaveClass("text-destructive");
    expect(value).not.toHaveClass("text-warning");
    expect(value).not.toHaveClass("text-success");
  });

  it("keeps 'Rentas activas' neutral-weighted regardless of value — never green, even when non-zero", () => {
    renderStats({
      activeRentalsCount: 7,
      concentradoresDisponibles: 1,
      tanquesDisponibles: 1,
    });

    const activeTile = screen.getByRole("group", {
      name: "Rentas activas: 7",
    });
    const value = within(activeTile).getByText("7");

    expect(value).toHaveClass("text-foreground");
    expect(value).not.toHaveClass("text-success");
    expect(value).not.toHaveClass("text-muted-foreground");
  });

  it("keeps 'Rentas activas' the exact same neutral class when it's zero too — no error/muted treatment either", () => {
    renderStats({
      activeRentalsCount: 0,
      concentradoresDisponibles: 1,
      tanquesDisponibles: 1,
    });

    const activeTile = screen.getByRole("group", {
      name: "Rentas activas: 0",
    });
    const value = within(activeTile).getByText("0");

    expect(value).toHaveClass("text-foreground");
    expect(value).not.toHaveClass("text-muted-foreground");
  });

  // design-fidelity Slice C (§4.1, design obs #2224 §C4): each tile's icon
  // carries a fixed per-card identity hue (blue/amber/teal) — it must NOT
  // change when availability drops to a low/urgent value, unlike the VALUE
  // text color above (which IS conditional, by separate established
  // business rule). This is the one place in this file a class assertion is
  // load-bearing: "fixed, not conditional" has no other observable signal.
  it("keeps each tile's icon hue fixed regardless of availability level — never conditional like the value color", () => {
    const { rerender } = render(
      <DashboardStats
        activeRentalsCount={3}
        concentradoresDisponibles={5}
        tanquesDisponibles={4}
        totalConcentradores={8}
        totalTanques={4}
        onSettingsUpdated={vi.fn()}
      />,
    );

    const concentradoresIconHigh = screen.getByTestId(
      "stat-icon-concentradores",
    );
    const tanquesIconHigh = screen.getByTestId("stat-icon-tanques");
    const activeIconHigh = screen.getByTestId("stat-icon-rentas-activas");

    rerender(
      <DashboardStats
        activeRentalsCount={0}
        concentradoresDisponibles={0}
        tanquesDisponibles={0}
        totalConcentradores={8}
        totalTanques={4}
        onSettingsUpdated={vi.fn()}
      />,
    );

    const concentradoresIconLow = screen.getByTestId(
      "stat-icon-concentradores",
    );
    const tanquesIconLow = screen.getByTestId("stat-icon-tanques");
    const activeIconLow = screen.getByTestId("stat-icon-rentas-activas");

    expect(concentradoresIconLow.className).toBe(
      concentradoresIconHigh.className,
    );
    expect(tanquesIconLow.className).toBe(tanquesIconHigh.className);
    expect(activeIconLow.className).toBe(activeIconHigh.className);
  });
});

describe("DashboardStats tap-to-edit (Feature: Runtime-Editable Total Stock)", () => {
  beforeEach(() => {
    updateBusinessSettings.mockReset();
  });

  it("does not make the Rentas activas tile tappable — it's a derived count, not a settable total", () => {
    renderStats();

    const tile = screen.getByRole("group", { name: "Rentas activas: 3" });
    expect(within(tile).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens an edit dialog pre-filled with the current total when the Concentradores tile is tapped", async () => {
    const user = userEvent.setup();
    renderStats();

    const tile = screen.getByRole("group", {
      name: "Concentradores disponibles: 5",
    });
    await user.click(within(tile).getByRole("button"));

    expect(
      screen.getByRole("heading", { name: "Editar total de concentradores" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Total")).toHaveTextContent("8");
  });

  it("opens an edit dialog pre-filled with the current total when the Tanques tile is tapped", async () => {
    const user = userEvent.setup();
    renderStats();

    const tile = screen.getByRole("group", {
      name: "Tanques disponibles: 2",
    });
    await user.click(within(tile).getByRole("button"));

    expect(
      screen.getByRole("heading", { name: "Editar total de tanques" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Total")).toHaveTextContent("2");
  });

  it("INCREASES the total concentradores and calls onSettingsUpdated with the new value", async () => {
    updateBusinessSettings.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 12,
      total_tanques: 2,
    });
    const user = userEvent.setup();
    const { onSettingsUpdated } = renderStats();

    const tile = screen.getByRole("group", {
      name: "Concentradores disponibles: 5",
    });
    await user.click(within(tile).getByRole("button"));

    // Stepper: 8 -> 12 (four taps), replacing the old free-text input.
    const increase = screen.getByLabelText("Sumar uno al total");
    await user.click(increase);
    await user.click(increase);
    await user.click(increase);
    await user.click(increase);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateBusinessSettings).toHaveBeenCalledWith({
      totalConcentradores: 12,
    });
    expect(onSettingsUpdated).toHaveBeenCalledWith({
      id: "s1",
      total_concentradores: 12,
      total_tanques: 2,
    });
    // Dialog closes after a successful save.
    expect(
      screen.queryByRole("heading", { name: "Editar total de concentradores" }),
    ).not.toBeInTheDocument();
  });

  it("DECREASES the total tanques and calls onSettingsUpdated with the new value (business owner: 'tanto para aumentar como disminuir')", async () => {
    updateBusinessSettings.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 8,
      total_tanques: 0,
    });
    const user = userEvent.setup();
    const { onSettingsUpdated } = renderStats();

    const tile = screen.getByRole("group", {
      name: "Tanques disponibles: 2",
    });
    await user.click(within(tile).getByRole("button"));

    // Stepper: 2 -> 0 (two taps), replacing the old free-text input.
    const decrease = screen.getByLabelText("Restar uno al total");
    await user.click(decrease);
    await user.click(decrease);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateBusinessSettings).toHaveBeenCalledWith({ totalTanques: 0 });
    expect(onSettingsUpdated).toHaveBeenCalledWith({
      id: "s1",
      total_concentradores: 8,
      total_tanques: 0,
    });
  });

  // Redesign — UX/UI pass: the free-text input (and its negative-value
  // error path) was replaced by a QuantityStepper whose "−" button is
  // simply disabled at 0 — a negative total can no longer be typed at all
  // through this dialog. `totalStockSchema`'s own negative-rejection is
  // still covered at the domain level (businessSettings.test.ts);
  // QuantityStepper's own min-disable behavior has its own unit test
  // (QuantityStepper.test.tsx) — this test only confirms the two are wired
  // together correctly here.
  it("disables the stepper's decrease button once the total reaches 0 — a negative total can't be entered", async () => {
    const user = userEvent.setup();
    renderStats({ totalTanques: 0, tanquesDisponibles: 0 });

    const tile = screen.getByRole("group", {
      name: "Tanques disponibles: 0",
    });
    await user.click(within(tile).getByRole("button"));

    expect(screen.getByLabelText("Restar uno al total")).toBeDisabled();
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });

  it("shows the Guardando… loading label while the save request is in flight", async () => {
    let resolveUpdate: (value: unknown) => void = () => {};
    updateBusinessSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const user = userEvent.setup();
    renderStats();

    const tile = screen.getByRole("group", {
      name: "Concentradores disponibles: 5",
    });
    await user.click(within(tile).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByRole("button", { name: "Guardando…" }),
    ).toBeInTheDocument();

    resolveUpdate({ id: "s1", total_concentradores: 8, total_tanques: 2 });
  });

  it("closes the dialog without saving when Cancelar is tapped", async () => {
    const user = userEvent.setup();
    renderStats();

    const tile = screen.getByRole("group", {
      name: "Concentradores disponibles: 5",
    });
    await user.click(within(tile).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("heading", { name: "Editar total de concentradores" }),
    ).not.toBeInTheDocument();
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });
});
