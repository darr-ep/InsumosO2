import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ItemQuantityPicker,
  emptyItemQuantities,
  itemQuantitiesToList,
} from "@/components/ItemQuantityPicker";

describe("ItemQuantityPicker (§7.1, §16.7)", () => {
  it("renders both product types with their labels and quantities", () => {
    render(
      <ItemQuantityPicker
        value={{ concentrator: 1, tank: 0 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Concentrador")).toBeInTheDocument();
    expect(screen.getByText("Tanque")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de concentrador")).toHaveTextContent(
      "1",
    );
    expect(screen.getByLabelText("Cantidad de tanque")).toHaveTextContent("0");
  });

  it("increments only the tapped product's quantity", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ItemQuantityPicker value={emptyItemQuantities} onChange={onChange} />,
    );

    await user.click(screen.getByLabelText("Agregar un tanque"));

    expect(onChange).toHaveBeenCalledWith({ concentrator: 0, tank: 1 });
  });

  it("disables the minus button at 0 and never goes negative", () => {
    render(
      <ItemQuantityPicker value={emptyItemQuantities} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Quitar un concentrador")).toBeDisabled();
  });

  it("decrements a positive quantity", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ItemQuantityPicker
        value={{ concentrator: 2, tank: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Quitar un concentrador"));

    expect(onChange).toHaveBeenCalledWith({ concentrator: 1, tank: 0 });
  });
});

describe("itemQuantitiesToList", () => {
  it("drops item types with quantity 0 and maps the rest to {itemType, quantity}", () => {
    expect(itemQuantitiesToList({ concentrator: 2, tank: 0 })).toEqual([
      { itemType: "concentrator", quantity: 2 },
    ]);
  });

  it("returns an empty list when nothing is selected", () => {
    expect(itemQuantitiesToList(emptyItemQuantities)).toEqual([]);
  });
});
