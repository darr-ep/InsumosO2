import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "@/components/SearchBar";

describe("SearchBar (§7.4, §16.9, CU3)", () => {
  it("reports every keystroke to the caller", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="" onChange={onChange} />);

    await user.type(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
      "184",
    );

    expect(onChange).toHaveBeenCalled();
  });

  it("renders the current value", () => {
    render(<SearchBar value="Juan" onChange={() => {}} />);

    expect(
      screen.getByLabelText("Buscar por folio, nombre o teléfono"),
    ).toHaveValue("Juan");
  });

  it("hides the clear button when there's no text", () => {
    render(<SearchBar value="" onChange={() => {}} />);

    expect(
      screen.queryByRole("button", { name: "Limpiar búsqueda" }),
    ).not.toBeInTheDocument();
  });

  it("shows a clear button once there's text, which clears it on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar value="Juan" onChange={onChange} />);

    await user.click(
      screen.getByRole("button", { name: "Limpiar búsqueda" }),
    );

    expect(onChange).toHaveBeenCalledWith("");
  });
});
