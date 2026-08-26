import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtrasList } from "@/components/ExtrasList";

describe("ExtrasList (§7.1, §11.2/§11.3)", () => {
  it("renders nothing but the add button when empty", () => {
    render(<ExtrasList value={[]} onChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Agregar otro concepto" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Concepto")).not.toBeInTheDocument();
  });

  it("appends a new empty row on 'Agregar otro concepto'", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ExtrasList value={[]} onChange={onChange} />);

    await user.click(
      screen.getByRole("button", { name: "Agregar otro concepto" }),
    );

    expect(onChange).toHaveBeenCalledWith([{ description: "", price: 0 }]);
  });

  it("updates the description of the row being edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ExtrasList
        value={[{ description: "", price: 0 }]}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText("Concepto"), "x");

    expect(onChange).toHaveBeenLastCalledWith([
      { description: "x", price: 0 },
    ]);
  });

  it("removes only the tapped row", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ExtrasList
        value={[
          { description: "Cubrebocas", price: 50 },
          { description: "Guantes", price: 30 },
        ]}
        onChange={onChange}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: "Quitar este concepto",
    });
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([
      { description: "Guantes", price: 30 },
    ]);
  });
});
