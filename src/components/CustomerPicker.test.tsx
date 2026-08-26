import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerPicker } from "@/components/CustomerPicker";
import type { CustomerRecord } from "@/data/customers.repo";

const searchCustomers = vi.fn();
const createCustomer = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
}));

const juan = {
  id: "c1",
  name: "Juan Pérez",
  phone: "5512345678",
} as CustomerRecord;

describe("CustomerPicker (§7.1)", () => {
  beforeEach(() => {
    searchCustomers.mockReset();
    createCustomer.mockReset();
  });

  it("searches as the user types and lets them pick a result", async () => {
    searchCustomers.mockResolvedValue([juan]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} />);

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );

    const resultButton = await screen.findByRole("button", {
      name: /Juan Pérez/,
    });
    await user.click(resultButton);

    expect(onSelect).toHaveBeenCalledWith(juan);
  });

  it("shows the selected customer with an option to change it", () => {
    const onSelect = vi.fn();
    render(<CustomerPicker selectedCustomer={juan} onSelect={onSelect} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("5512345678")).toBeInTheDocument();
  });

  it("switches to 'Cliente nuevo' and creates + selects a customer on submit", async () => {
    createCustomer.mockResolvedValue(juan);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Cliente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.upload(
      screen.getByLabelText("Foto de credencial"),
      new File(["x"], "credencial.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(juan);
  });
});
