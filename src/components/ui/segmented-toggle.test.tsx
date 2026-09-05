import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

/**
 * design-fidelity Slice C (design obs #2224 §C1): extracted from
 * `PaymentDialog.tsx`'s Pago/Ajuste pill-toggle pattern. `role="group"`
 * with `aria-pressed` per button — NOT `role="tablist"`, since there is no
 * associated `tabpanel`, just a single filtered region below.
 */
describe("SegmentedToggle (design-fidelity §C1)", () => {
  const options = [
    { value: "activas" as const, label: "Activas" },
    { value: "historial" as const, label: "Historial" },
  ];

  it("renders each option as a button inside a role=group, labeled by ariaLabel", () => {
    render(
      <SegmentedToggle
        value="activas"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    const group = screen.getByRole("group", { name: "Filtrar rentas" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activas" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Historial" }),
    ).toBeInTheDocument();
  });

  it("marks the currently selected option with aria-pressed=true, and the other false", () => {
    render(
      <SegmentedToggle
        value="historial"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    expect(screen.getByRole("button", { name: "Activas" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Historial" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("calls onChange with the tapped option's value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedToggle
        value="activas"
        onChange={onChange}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Historial" }));

    expect(onChange).toHaveBeenCalledWith("historial");
  });

  it("shows an optional count next to an option's label when given", () => {
    render(
      <SegmentedToggle
        value="activas"
        onChange={vi.fn()}
        options={[
          { value: "activas" as const, label: "Activas", count: 3 },
          { value: "historial" as const, label: "Historial", count: 0 },
        ]}
        ariaLabel="Filtrar rentas"
      />,
    );

    expect(screen.getByRole("button", { name: "Activas 3" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Historial 0" }),
    ).toBeInTheDocument();
  });
});
