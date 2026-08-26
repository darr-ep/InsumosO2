import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";

const getCustomer = vi.fn();
const getCredentialPhotoUrl = vi.fn();
const updateCustomerCredentialPhoto = vi.fn();
const listRentalsForCustomer = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  getCustomer: (...args: unknown[]) => getCustomer(...args),
  getCredentialPhotoUrl: (...args: unknown[]) => getCredentialPhotoUrl(...args),
  updateCustomerCredentialPhoto: (...args: unknown[]) =>
    updateCustomerCredentialPhoto(...args),
}));

vi.mock("@/data/rentals.repo", () => ({
  listRentalsForCustomer: (...args: unknown[]) => listRentalsForCustomer(...args),
}));

const customerWithPhoto = {
  id: "c1",
  name: "Juan Pérez",
  phone: "5512345678",
  credential_photo: "credencial.png",
};

const customerPending = {
  id: "c2",
  name: "María López",
  phone: "5559876543",
  credential_photo: "",
};

function makePhoto(name = "credencial.png", type = "image/png", size = 1024) {
  return new File(["x".repeat(size)], name, { type });
}

describe("CustomerDetailSheet (§16.6, §15, §16.13, CU7, task 3.4)", () => {
  beforeEach(() => {
    getCustomer.mockReset();
    getCredentialPhotoUrl.mockReset();
    updateCustomerCredentialPhoto.mockReset();
    listRentalsForCustomer.mockReset();
  });

  it("shows the customer's 4 rentals with their status (CU7 first scenario)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000004", status: "ACTIVE", initial_rent_amount: 2800 },
      { id: "r2", folio: "R-000003", status: "RETURNED", initial_rent_amount: 1500 },
      { id: "r3", folio: "R-000002", status: "RETURNED", initial_rent_amount: 1500 },
      { id: "r4", folio: "R-000001", status: "RETURNED", initial_rent_amount: 2800 },
    ]);

    render(
      <CustomerDetailSheet open onOpenChange={vi.fn()} customerId="c1" />,
    );

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("R-000004")).toBeInTheDocument();
    expect(screen.getByText("R-000003")).toBeInTheDocument();
    expect(screen.getByText("R-000002")).toBeInTheDocument();
    expect(screen.getByText("R-000001")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getAllByText("Devuelta")).toHaveLength(3);
  });

  it("requests a file token and shows the credential image only after 'Ver credencial' is pressed (CU7 second scenario)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );
    const user = userEvent.setup();

    render(
      <CustomerDetailSheet open onOpenChange={vi.fn()} customerId="c1" />,
    );

    // Not shown until explicitly requested.
    expect(
      screen.queryByAltText("Credencial del cliente"),
    ).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "Ver credencial" }),
    );

    expect(getCredentialPhotoUrl).toHaveBeenCalledWith(customerWithPhoto);
    expect(await screen.findByAltText("Credencial del cliente")).toHaveAttribute(
      "src",
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );
  });

  it("shows the 'credencial pendiente' state and lets staff upload a photo later (§16.13/Anexo A.5)", async () => {
    getCustomer.mockResolvedValue(customerPending);
    listRentalsForCustomer.mockResolvedValue([]);
    updateCustomerCredentialPhoto.mockResolvedValue({
      ...customerPending,
      credential_photo: "nueva.png",
    });
    const user = userEvent.setup();

    render(
      <CustomerDetailSheet open onOpenChange={vi.fn()} customerId="c2" />,
    );

    expect(
      await screen.findByText("Credencial pendiente. Puedes agregarla ahora."),
    ).toBeInTheDocument();
    // No "Ver credencial" button while pending — there's nothing to view.
    expect(
      screen.queryByRole("button", { name: "Ver credencial" }),
    ).not.toBeInTheDocument();

    const photo = makePhoto();
    await user.upload(
      screen.getByLabelText("Foto de credencial"),
      photo,
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar credencial" }),
    );

    await waitFor(() =>
      expect(updateCustomerCredentialPhoto).toHaveBeenCalledWith("c2", photo),
    );
    // After a successful retry upload, the pending state clears — the
    // "Ver credencial" affordance takes over.
    expect(
      await screen.findByRole("button", { name: "Ver credencial" }),
    ).toBeInTheDocument();
  });

  it("shows an error when the credential fails to load", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();

    render(
      <CustomerDetailSheet open onOpenChange={vi.fn()} customerId="c1" />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Ver credencial" }),
    );

    expect(
      await screen.findByText("No se pudo cargar la credencial."),
    ).toBeInTheDocument();
  });

  it("shows an error when the customer fails to load", async () => {
    getCustomer.mockRejectedValue(new Error("network"));
    listRentalsForCustomer.mockResolvedValue([]);

    render(
      <CustomerDetailSheet open onOpenChange={vi.fn()} customerId="c1" />,
    );

    expect(
      await screen.findByText("No se pudo cargar el cliente."),
    ).toBeInTheDocument();
  });
});
