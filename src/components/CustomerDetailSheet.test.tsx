import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";

// design-fidelity Slice C, task 5: the "Sin rentas" empty state's
// "+ Nueva renta" CTA navigates away — mocked the same way
// `LoginScreen.test.tsx` mocks `useNavigate`, preserving `MemoryRouter`
// (and every other real react-router export `RentalDetailSheet`/
// `AppHeader` rely on) via `importActual`.
const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return { ...actual, useNavigate: () => navigate };
});

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
    navigate.mockReset();
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/default/credencial.png?token=default",
    );
  });

  // design-fidelity Slice C (design obs #2224 §C1/C2, task 4): the two
  // always-visible stacked sections are replaced by ONE list, controlled by
  // an Activas/Historial `SegmentedToggle` — "Activas" is the default
  // segment. Supersedes the two tests this replaces (the two-stacked-
  // sections structure and its per-section-empty-state proof), which
  // asserted the now-removed structure directly.
  it("shows only the Activas segment by default, with the toggle available to switch to Historial (never mixed together)", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000004", status: "ACTIVE", initial_rent_amount: 2800 },
      { id: "r2", folio: "R-000003", status: "RETURNED", initial_rent_amount: 1500 },
    ]);

    renderSheet();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("R-000004")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.queryByText("R-000003")).not.toBeInTheDocument();

    expect(
      screen.getByRole("radio", { name: /^Activas/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /^Historial/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("switches to the Historial segment when tapped, hiding Activas entirely", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000004", status: "ACTIVE", initial_rent_amount: 2800 },
      { id: "r2", folio: "R-000003", status: "RETURNED", initial_rent_amount: 1500 },
      { id: "r3", folio: "R-000002", status: "RETURNED", initial_rent_amount: 1500 },
    ]);
    const user = userEvent.setup();

    renderSheet();
    await screen.findByText("Juan Pérez");

    await user.click(screen.getByRole("radio", { name: /^Historial/ }));

    expect(screen.getByText("R-000003")).toBeInTheDocument();
    expect(screen.getByText("R-000002")).toBeInTheDocument();
    expect(screen.getAllByText("Devuelta")).toHaveLength(2);
    expect(screen.queryByText("R-000004")).not.toBeInTheDocument();
  });

  it("shows a per-segment empty message when the selected segment has no rentals, while the customer still has some overall", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000001", status: "RETURNED", initial_rent_amount: 2800 },
    ]);

    renderSheet();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    // Activas is empty (only a RETURNED rental exists), but the toggle
    // itself still renders — this is NOT the "Sin rentas" zero-total case.
    expect(screen.getByText("Sin rentas activas")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Historial/ })).toBeInTheDocument();
  });

  it("shows the 'Sin rentas activas' empty state with a '+ Nueva renta' CTA and keep the toggle available when the customer has no rentals at all", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);

    renderSheet();

    expect(await screen.findByText("Sin rentas activas")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /^Activas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Nueva renta/i }),
    ).toBeInTheDocument();
  });

  it("navigates to /nueva-renta and closes the sheet when the 'Sin rentas activas' CTA is tapped", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderSheet({ onOpenChange });
    await user.click(
      await screen.findByRole("button", { name: /Nueva renta/i }),
    );

    expect(navigate).toHaveBeenCalledWith("/nueva-renta");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // design-fidelity Slice C (design obs #2224 §C2): plain `<p>` in a Sheet,
  // no parent button — a bare `tel:` anchor suffices here, no stretched-link
  // restructure needed (unlike RentalCard/CustomerCard).
  it("renders the customer's phone as a tel: link", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);

    renderSheet();

    const telLink = await screen.findByRole("link", { name: /551\s*234\s*5678/ });
    expect(telLink).toHaveAttribute("href", "tel:5512345678");
  });

  // design-fidelity post-audit bugfix batch (pencil ground truth): the
  // phone row, the credential card, and every rental row (active +
  // historial) must sit on a --card surface, matching the rest of the
  // redesigned sheet — none of these had a background before this batch.
  it("renders the phone row on a --card surface", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);

    renderSheet();

    const telLink = await screen.findByRole("link", { name: /551\s*234\s*5678/ });
    expect(telLink.closest(".bg-card")).not.toBeNull();
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

  it("renders an active rental row on a --card surface", async () => {
    getCustomer.mockResolvedValue(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([
      { id: "r1", folio: "R-000004", status: "ACTIVE", initial_rent_amount: 2800 },
    ]);

    renderSheet();

    const row = (await screen.findByText("R-000004")).closest("button")!;
    expect(row).toHaveClass("bg-card");
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

    // design-fidelity #8: cancelling with unsaved changes now requires
    // confirming the discard first (obs #2221/#2222/#2223/#2224).
    expect(
      screen.getByRole("heading", { name: "¿Descartar los cambios?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sí, descartar" }));

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(updateCustomerContactInfo).not.toHaveBeenCalled();
  });

  it("keeps editing (no discard) when 'Seguir editando' is pressed after cancelling with unsaved changes (design-fidelity #8)", async () => {
    getCustomer.mockResolvedValueOnce(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    const user = userEvent.setup();

    renderSheet();

    await user.click(await screen.findByRole("button", { name: "Editar cliente" }));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "algo distinto");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(
      screen.queryByRole("heading", { name: "¿Descartar los cambios?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("algo distinto");
    expect(updateCustomerContactInfo).not.toHaveBeenCalled();
  });

  it("cancels the edit immediately, with no confirmation popup, when nothing was changed (design-fidelity #8 guard)", async () => {
    getCustomer.mockResolvedValueOnce(customerWithPhoto);
    listRentalsForCustomer.mockResolvedValue([]);
    const user = userEvent.setup();

    renderSheet();

    await user.click(await screen.findByRole("button", { name: "Editar cliente" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("heading", { name: "¿Descartar los cambios?" }),
    ).not.toBeInTheDocument();
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

  it("shows the 'Sin credencial registrada' state when pending, and opens edit mode with camera capture", async () => {
    getCustomer.mockResolvedValue(customerPending);
    listRentalsForCustomer.mockResolvedValue([]);
    const updatedCustomer = { ...customerPending, credential_photo: "nueva.jpg" };
    updateCustomerCredentialPhoto.mockResolvedValue(updatedCustomer);
    getCredentialPhotoUrl.mockResolvedValue(
      "http://pb.local/api/files/customers/c2/nueva.jpg?token=xyz",
    );
    const user = userEvent.setup();

    renderSheet({ customerId: "c2" });

    const pendingText = await screen.findByText(
      "Sin credencial registrada",
    );
    expect(pendingText).toBeInTheDocument();
    expect(pendingText.closest(".bg-card")).not.toBeNull();
    // No "Ver credencial" and no eager fetch while pending — there's
    // nothing to view yet.
    expect(
      screen.queryByRole("button", { name: "Ver credencial" }),
    ).not.toBeInTheDocument();
    expect(getCredentialPhotoUrl).not.toHaveBeenCalled();

    // Camera is not rendered directly in the detail view
    expect(
      screen.queryByRole("button", { name: "Simular captura" }),
    ).not.toBeInTheDocument();

    // Entering edit mode makes the camera capture available
    await user.click(screen.getByRole("button", { name: /editar cliente/i }));
    expect(
      await screen.findByRole("button", { name: "Simular captura" }),
    ).toBeInTheDocument();
  });

  it("shows a 'Guardando…' label while the credential retry-upload (fired from inside edit mode) is in flight", async () => {
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
    await screen.findByText("Sin credencial registrada");
    await user.click(screen.getByRole("button", { name: /editar cliente/i }));
    await user.click(
      await screen.findByRole("button", { name: "Simular captura" }),
    );

    expect(await screen.findByText("Guardando…")).toBeInTheDocument();

    resolveUpload({ ...customerPending, credential_photo: "nueva.jpg" });
    await waitFor(() =>
      expect(screen.queryByText("Guardando…")).not.toBeInTheDocument(),
    );
  });

  it("shows the retry-upload error even after the user already saved name/phone and left edit mode (the upload is fire-and-forget from inside the edit form)", async () => {
    getCustomer.mockResolvedValue(customerPending);
    listRentalsForCustomer.mockResolvedValue([]);
    let rejectUpload: (error: Error) => void = () => {};
    updateCustomerCredentialPhoto.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpload = reject;
      }),
    );
    updateCustomerContactInfo.mockResolvedValue({
      ...customerPending,
      name: "María L. López",
    });
    const user = userEvent.setup();

    renderSheet({ customerId: "c2" });
    await screen.findByText("Sin credencial registrada");
    await user.click(screen.getByRole("button", { name: /editar cliente/i }));
    await user.click(
      await screen.findByRole("button", { name: "Simular captura" }),
    );
    expect(await screen.findByText("Guardando…")).toBeInTheDocument();

    // Save name/phone before the background photo upload settles — exits
    // edit mode while the upload is still in flight.
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /editar cliente/i }),
      ).toBeInTheDocument(),
    );

    // The upload now fails — the error must still surface even though
    // `isEditing` is already false.
    rejectUpload(new Error("network"));
    expect(
      await screen.findByText("No se pudo subir la foto. Intenta de nuevo."),
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
