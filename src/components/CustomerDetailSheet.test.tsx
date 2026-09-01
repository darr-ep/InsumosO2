import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";

/**
 * Feature: Credential Photo Camera + Compression (Batch 3b) — two real UX
 * changes, business owner's explicit request:
 * 1. Eager fetch + blur-and-reveal: the credential photo URL is fetched as
 *    soon as the sheet opens for a non-pending customer (same protected
 *    `getCredentialPhotoUrl` call, still never used in a listing — only
 *    inside one customer's own detail sheet, §15-compliant), rendered
 *    immediately blurred inside a fixed ID-card-shaped box, with a "Ver
 *    credencial" overlay that reveals it client-side (no re-fetch).
 * 2. The retry-upload flow ("credencial pendiente") now uses
 *    `CredentialCameraCapture` directly — capture already IS the upload
 *    trigger, no separate confirm step.
 *
 * `CredentialCameraCapture` is mocked to a one-button stub — its own
 * capture/compress/fallback behavior is covered by
 * `CredentialCameraCapture.test.tsx`; these tests only prove this sheet's
 * wiring.
 */

vi.mock("@/components/CredentialCameraCapture", () => ({
  CredentialCameraCapture: ({
    onCapture,
  }: {
    onCapture: (file: File) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCapture(new File(["x"], "credencial.jpg", { type: "image/jpeg" }))
      }
    >
      Simular captura
    </button>
  ),
}));

const getCustomer = vi.fn();
const getCredentialPhotoUrl = vi.fn();
const updateCustomerCredentialPhoto = vi.fn();
const updateCustomerContactInfo = vi.fn();
const listRentalsForCustomer = vi.fn();
const getRental = vi.fn();
const listItemsForRental = vi.fn();
const listPaymentsForRental = vi.fn();

vi.mock("@/data/customers.repo", () => ({
  getCustomer: (...args: unknown[]) => getCustomer(...args),
  getCredentialPhotoUrl: (...args: unknown[]) => getCredentialPhotoUrl(...args),
  updateCustomerCredentialPhoto: (...args: unknown[]) =>
    updateCustomerCredentialPhoto(...args),
  updateCustomerContactInfo: (...args: unknown[]) =>
    updateCustomerContactInfo(...args),
}));

// `RentalDetailSheet` (Redesign Round 3, punto E: rentas clickeables) is
// nested inside this component now — its own `@/data/rentals.repo` and
// `@/data/payments.repo` calls need mocks here too, even though this file's
// own tests mostly never open it.
vi.mock("@/data/rentals.repo", () => ({
  listRentalsForCustomer: (...args: unknown[]) => listRentalsForCustomer(...args),
  getRental: (...args: unknown[]) => getRental(...args),
  listItemsForRental: (...args: unknown[]) => listItemsForRental(...args),
}));

vi.mock("@/data/payments.repo", () => ({
  listPaymentsForRental: (...args: unknown[]) => listPaymentsForRental(...args),
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

// `RentalDetailSheet` (nested here since Redesign Round 3, punto E) calls
// `useNavigate()` unconditionally — every render needs a Router ancestor,
// even the tests that never open it.
function renderSheet(
  props: Partial<React.ComponentProps<typeof CustomerDetailSheet>> = {},
) {
  return render(
    <MemoryRouter>
      <CustomerDetailSheet
        open
        onOpenChange={vi.fn()}
        customerId="c1"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("CustomerDetailSheet (§16.6, §15, §16.13, CU7, task 3.4)", () => {
  beforeEach(() => {
    getCustomer.mockReset();
    getCredentialPhotoUrl.mockReset();
    updateCustomerCredentialPhoto.mockReset();
    updateCustomerContactInfo.mockReset();
    listRentalsForCustomer.mockReset();
    getRental.mockReset();
    listItemsForRental.mockReset();
    listPaymentsForRental.mockReset();
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/default/credencial.png?token=default",
    );
  });

  it("splits rentals into 'Rentas activas' and 'Historial' sections, never mixed together (real bug fix — business owner's own principle: 'Diferenciar claramente rentas activas del historial de rentas')", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000004", status: "ACTIVE", initial_rent_amount: 2800 },
      { id: "r2", folio: "R-000003", status: "RETURNED", initial_rent_amount: 1500 },
      { id: "r3", folio: "R-000002", status: "RETURNED", initial_rent_amount: 1500 },
      { id: "r4", folio: "R-000001", status: "RETURNED", initial_rent_amount: 2800 },
    ]);

    renderSheet();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();

    const activeSection = screen
      .getByRole("heading", { name: "Rentas activas" })
      .closest("section")!;
    const historialSection = screen
      .getByRole("heading", { name: "Historial" })
      .closest("section")!;

    // ACTIVE rental only inside "Rentas activas".
    expect(within(activeSection).getByText("R-000004")).toBeInTheDocument();
    expect(within(activeSection).getByText("Activa")).toBeInTheDocument();
    expect(
      within(activeSection).queryByText("R-000003"),
    ).not.toBeInTheDocument();

    // RETURNED rentals only inside "Historial" — never mixed with the
    // active one, and never both shown under one ambiguous heading.
    expect(within(historialSection).getByText("R-000003")).toBeInTheDocument();
    expect(within(historialSection).getByText("R-000002")).toBeInTheDocument();
    expect(within(historialSection).getByText("R-000001")).toBeInTheDocument();
    expect(within(historialSection).getAllByText("Devuelta")).toHaveLength(3);
    expect(
      within(historialSection).queryByText("R-000004"),
    ).not.toBeInTheDocument();
  });

  it("shows a per-section empty state when a customer has no active rentals or no historial", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000001", status: "RETURNED", initial_rent_amount: 2800 },
    ]);

    renderSheet();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Sin rentas activas.")).toBeInTheDocument();
    expect(screen.queryByText("Sin historial.")).not.toBeInTheDocument();
  });

  it("opens the rental's detail sheet when an active rental row is tapped (Redesign Round 3, punto E)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000004", status: "ACTIVE", initial_rent_amount: 2800 },
    ]);
    getRental.mockResolvedValue({
      id: "r1",
      folio: "R-000004",
      status: "ACTIVE",
      initial_rent_amount: 2800,
      deposit_amount: 1000,
      created: "2026-08-01T10:00:00.000Z",
      expand: { customer_id: customerWithPhoto },
    });
    listItemsForRental.mockResolvedValue([]);
    listPaymentsForRental.mockResolvedValue([]);
    const user = userEvent.setup();

    renderSheet();

    await user.click(await screen.findByText("R-000004"));

    expect(
      await screen.findByRole("heading", { name: "Renta R-000004" }),
    ).toBeInTheDocument();
  });

  it("fetches the credential eagerly when the sheet opens (no button tap needed) and shows a blurred ID-card preview with a 'Ver credencial' reveal button (CU7)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );

    renderSheet();

    await waitFor(() =>
      expect(getCredentialPhotoUrl).toHaveBeenCalledWith(customerWithPhoto),
    );

    const image = await screen.findByAltText("Credencial del cliente");
    expect(image).toHaveAttribute(
      "src",
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );
    expect(image.className).toMatch(/blur-md/);
    expect(
      screen.getByRole("button", { name: "Ver credencial" }),
    ).toBeInTheDocument();
  });

  it("lets editing name/phone in-place and saving via updateCustomerContactInfo (Redesign — UX/UI pass, business-owner request)", async () => {
    getCustomer.mockResolvedValueOnce(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    updateCustomerContactInfo.mockResolvedValueOnce({
      ...customerWithPhoto,
      name: "Juan P. Pérez",
    });
    const user = userEvent.setup();

    renderSheet();

    await user.click(await screen.findByRole("button", { name: "Editar cliente" }));

    const nameInput = screen.getByLabelText("Nombre");
    await user.clear(nameInput);
    await user.type(nameInput, "Juan P. Pérez");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateCustomerContactInfo).toHaveBeenCalledWith("c1", {
        name: "Juan P. Pérez",
        phone: "5512345678",
      }),
    );
    expect(await screen.findByText("Juan P. Pérez")).toBeInTheDocument();
  });

  it("shows an error and stays in edit mode when saving the edit fails", async () => {
    getCustomer.mockResolvedValueOnce(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    updateCustomerContactInfo.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();

    renderSheet();

    await user.click(await screen.findByRole("button", { name: "Editar cliente" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("No se pudo guardar el cambio. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("cancels the edit without saving and shows the original name again", async () => {
    getCustomer.mockResolvedValueOnce(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    const user = userEvent.setup();

    renderSheet();

    await user.click(await screen.findByRole("button", { name: "Editar cliente" }));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "algo distinto");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(updateCustomerContactInfo).not.toHaveBeenCalled();
  });

  it("shows a lock icon on the 'Ver credencial' reveal button (Redesign — UX/UI pass)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );

    renderSheet();

    const revealButton = await screen.findByRole("button", {
      name: "Ver credencial",
    });
    expect(revealButton.querySelector("svg")).toBeInTheDocument();
  });

  it("reveals the credential image on tap, client-side only — no additional fetch", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );
    const user = userEvent.setup();

    renderSheet();

    const image = await screen.findByAltText("Credencial del cliente");
    expect(image.className).toMatch(/blur-md/);

    await user.click(screen.getByRole("button", { name: "Ver credencial" }));

    expect(image.className).not.toMatch(/blur-md/);
    expect(
      screen.queryByRole("button", { name: "Ver credencial" }),
    ).not.toBeInTheDocument();
    // Same src before and after reveal — proves it's a client-side toggle,
    // not a re-fetch.
    expect(image).toHaveAttribute(
      "src",
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );
    expect(getCredentialPhotoUrl).toHaveBeenCalledTimes(1);
  });

  it("opens an enlarged viewer when the revealed credential image is tapped (Redesign Round 3, punto F)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c1/credencial.png?token=abc",
    );
    const user = userEvent.setup();

    renderSheet();

    const image = await screen.findByAltText("Credencial del cliente");
    await user.click(screen.getByRole("button", { name: "Ver credencial" }));

    expect(
      screen.queryByAltText("Credencial del cliente (ampliada)"),
    ).not.toBeInTheDocument();

    await user.click(image);

    expect(
      await screen.findByAltText("Credencial del cliente (ampliada)"),
    ).toBeInTheDocument();
  });

  it("shows the 'credencial pendiente' state, uploads via the camera in one step (capture IS the upload), and then shows the eager blurred preview (§16.13/Anexo A.5)", async () => {
    getCustomer.mockResolvedValue(customerPending);
    listRentalsForCustomer.mockResolvedValue([]);
    const updatedCustomer = { ...customerPending, credential_photo: "nueva.jpg" };
    updateCustomerCredentialPhoto.mockResolvedValue(updatedCustomer);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c2/nueva.jpg?token=xyz",
    );
    const user = userEvent.setup();

    renderSheet({ customerId: "c2" });

    expect(
      await screen.findByText("Credencial pendiente. Puedes agregarla ahora."),
    ).toBeInTheDocument();
    // No "Ver credencial" and no eager fetch while pending — there's
    // nothing to view yet.
    expect(
      screen.queryByRole("button", { name: "Ver credencial" }),
    ).not.toBeInTheDocument();
    expect(getCredentialPhotoUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Simular captura" }));

    await waitFor(() =>
      expect(updateCustomerCredentialPhoto).toHaveBeenCalledWith(
        "c2",
        expect.any(File),
      ),
    );

    await waitFor(() =>
      expect(getCredentialPhotoUrl).toHaveBeenCalledWith(updatedCustomer),
    );
    const image = await screen.findByAltText("Credencial del cliente");
    expect(image.className).toMatch(/blur-md/);
    expect(
      screen.getByRole("button", { name: "Ver credencial" }),
    ).toBeInTheDocument();
  });

  it("shows a 'Guardando…' label while the retry upload is in flight", async () => {
    getCustomer.mockResolvedValue(customerPending);
    listRentalsForCustomer.mockResolvedValue([]);
    let resolveUpload: (value: typeof customerPending) => void = () => {};
    updateCustomerCredentialPhoto.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const user = userEvent.setup();

    renderSheet({ customerId: "c2" });
    await user.click(
      await screen.findByRole("button", { name: "Simular captura" }),
    );

    expect(await screen.findByText("Guardando…")).toBeInTheDocument();

    resolveUpload({ ...customerPending, credential_photo: "nueva.jpg" });
    await waitFor(() =>
      expect(screen.queryByText("Guardando…")).not.toBeInTheDocument(),
    );
  });

  it("shows an error and keeps the camera available when the retry upload fails", async () => {
    getCustomer.mockResolvedValue(customerPending);
    listRentalsForCustomer.mockResolvedValue([]);
    updateCustomerCredentialPhoto.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();

    renderSheet({ customerId: "c2" });
    await user.click(
      await screen.findByRole("button", { name: "Simular captura" }),
    );

    expect(
      await screen.findByText("No se pudo subir la foto. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simular captura" }),
    ).toBeInTheDocument();
  });

  it("shows an error when the eager credential fetch fails", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    getCredentialPhotoUrl.mockRejectedValue(new Error("network"));

    renderSheet();

    expect(
      await screen.findByText("No se pudo cargar la credencial."),
    ).toBeInTheDocument();
  });

  it("shows an error when the customer fails to load", async () => {
    getCustomer.mockRejectedValue(new Error("network"));
    listRentalsForCustomer.mockResolvedValue([]);

    renderSheet();

    expect(
      await screen.findByText("No se pudo cargar el cliente."),
    ).toBeInTheDocument();
  });
});
