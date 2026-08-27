import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientResponseError } from "pocketbase";
import { CustomerPicker } from "@/components/CustomerPicker";
import type { CustomerRecord } from "@/data/customers.repo";
import { consumeSessionMessage, STALE_SESSION_MESSAGE } from "@/data/staleSession";

const searchCustomers = vi.fn();
const createCustomer = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
}));

const clear = vi.fn();

// §14 gap-fill: `handleCreate`'s catch block calls the real
// `staleSession.ts` helper, which calls `pb.authStore.clear()` — mocked
// here the same way App.test.tsx already mocks `pb`, so this stays a fast
// unit test with no real PocketBase client involved.
vi.mock("@/data/pocketbaseClient", () => ({
  pb: { authStore: { clear: (...args: unknown[]) => clear(...args) } },
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
    clear.mockReset();
    consumeSessionMessage();
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
    // No "Ver ficha" affordance unless the caller opts in.
    expect(
      screen.queryByRole("button", { name: "Ver ficha" }),
    ).not.toBeInTheDocument();
  });

  it("calls onViewCustomer with the selected customer's id when 'Ver ficha' is pressed (§16.6)", async () => {
    const onSelect = vi.fn();
    const onViewCustomer = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomerPicker
        selectedCustomer={juan}
        onSelect={onSelect}
        onViewCustomer={onViewCustomer}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver ficha" }));

    expect(onViewCustomer).toHaveBeenCalledWith("c1");
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

  it("shows the generic save-error message on a real failure (network/validation), never clearing the session (§14 gap-fill, regression)", async () => {
    createCustomer.mockRejectedValueOnce(new Error("network down"));
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Cliente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(
      await screen.findByText("No se pudo guardar el cliente. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clears the session instead of showing the generic message when the create fails with a stale-session-shaped error (§14 gap-fill — the real live bug: 'Crear cliente' failing with a rotated tokenKey)", async () => {
    createCustomer.mockRejectedValueOnce(
      new ClientResponseError({
        status: 400,
        response: { message: "Failed to create record.", data: {} },
      }),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Cliente nuevo" }));
    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("No se pudo guardar el cliente. Intenta de nuevo."),
    ).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
  });
});
