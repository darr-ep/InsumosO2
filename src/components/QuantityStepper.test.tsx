import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuantityStepper } from "@/components/QuantityStepper";

describe("QuantityStepper", () => {
  it("shows the current value and calls onChange with value+1/-1", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <QuantityStepper
        value={3}
        onChange={onChange}
        decreaseLabel="Quitar uno"
        increaseLabel="Agregar uno"
        valueLabel="Cantidad"
      />,
    );

    expect(screen.getByLabelText("Cantidad")).toHaveTextContent("3");

    await user.click(screen.getByLabelText("Agregar uno"));
    expect(onChange).toHaveBeenCalledWith(4);

    await user.click(screen.getByLabelText("Quitar uno"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("disables the decrease button at min and never calls onChange below it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <QuantityStepper
        value={0}
        onChange={onChange}
        min={0}
        decreaseLabel="Quitar uno"
        increaseLabel="Agregar uno"
        valueLabel="Cantidad"
      />,
    );

    expect(screen.getByLabelText("Quitar uno")).toBeDisabled();
    await user.click(screen.getByLabelText("Quitar uno"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
