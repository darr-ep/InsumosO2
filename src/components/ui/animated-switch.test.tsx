import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AnimatedSwitch,
  type AnimatedSwitchOption,
} from "@/components/ui/animated-switch";

/**
 * Small controlled-state harness for tests that need to observe the
 * component behaving as a real controlled input across multiple
 * interactions (e.g. two consecutive keyboard moves) — `AnimatedSwitch`
 * itself has no internal state, so a test that only ever passes a fixed
 * `value` prop can't exercise a second move correctly.
 */
function ControlledAnimatedSwitch({
  initialValue,
  options,
  onChange,
}: {
  initialValue: "activas" | "historial";
  options: AnimatedSwitchOption<"activas" | "historial">[];
  onChange: (value: "activas" | "historial") => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <AnimatedSwitch
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      options={options}
      ariaLabel="Filtrar rentas"
    />
  );
}

/**
 * Owner reversal (post-implementation audit, design-fidelity): replaces the
 * `role="group"` two-button pattern with a genuine sliding switch — single
 * track (`role="radiogroup"`), one indicator that animates between the two
 * option positions. See `animated-switch.tsx`'s own docblock for the full
 * rationale and the ARIA-pattern choice (`radiogroup`/`radio`, not
 * `tablist`/`tab`, unlike `segmented-toggle.tsx`'s own choice of `group`).
 */
describe("AnimatedSwitch (design-fidelity, owner reversal of SegmentedToggle)", () => {
  const options = [
    { value: "activas" as const, label: "Activas" },
    { value: "historial" as const, label: "Historial" },
  ];

  it("renders both options inside a single radiogroup track, labeled by ariaLabel", () => {
    render(
      <AnimatedSwitch
        value="activas"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Filtrar rentas" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Activas" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Historial" }),
    ).toBeInTheDocument();
  });

  it("marks the currently selected option with aria-checked=true, and the other false", () => {
    render(
      <AnimatedSwitch
        value="historial"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    expect(screen.getByRole("radio", { name: "Activas" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Historial" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("calls onChange with the tapped option's value when clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AnimatedSwitch
        value="activas"
        onChange={onChange}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Historial" }));

    expect(onChange).toHaveBeenCalledWith("historial");
  });

  it("shows an optional count next to an option's label when given", () => {
    render(
      <AnimatedSwitch
        value="activas"
        onChange={vi.fn()}
        options={[
          { value: "activas" as const, label: "Activas", count: 3 },
          { value: "historial" as const, label: "Historial", count: 0 },
        ]}
        ariaLabel="Filtrar rentas"
      />,
    );

    expect(screen.getByRole("radio", { name: "Activas 3" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Historial 0" }),
    ).toBeInTheDocument();
  });

  // Single-track sliding indicator (not two independent buttons): the
  // indicator is one element whose position (via CSS transform) reflects
  // the selected index, and it carries a CSS transition so the move
  // animates instead of jumping instantly.
  it("slides the single indicator's transform position when the selected option changes, with a CSS transition applied", () => {
    const { rerender } = render(
      <AnimatedSwitch
        value="activas"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    const indicator = screen.getByTestId("animated-switch-indicator");
    expect(indicator.className).toMatch(/transition-transform/);
    expect(indicator.style.transform).toBe("translateX(0%)");

    rerender(
      <AnimatedSwitch
        value="historial"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    expect(indicator.style.transform).toBe("translateX(100%)");
  });

  it("is keyboard-accessible: ArrowRight/ArrowLeft move the selection between options", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ControlledAnimatedSwitch
        initialValue="activas"
        options={options}
        onChange={onChange}
      />,
    );

    const activas = screen.getByRole("radio", { name: "Activas" });
    activas.focus();
    expect(activas).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("historial");

    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("activas");
  });

  it("keeps a roving tabIndex: only the selected option is tab-focusable", () => {
    render(
      <AnimatedSwitch
        value="activas"
        onChange={vi.fn()}
        options={options}
        ariaLabel="Filtrar rentas"
      />,
    );

    expect(screen.getByRole("radio", { name: "Activas" })).toHaveAttribute(
      "tabIndex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "Historial" })).toHaveAttribute(
      "tabIndex",
      "-1",
    );
  });
});
