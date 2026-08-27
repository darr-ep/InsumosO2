import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ClientResponseError } from "pocketbase";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { consumeSessionMessage, STALE_SESSION_MESSAGE } from "@/data/staleSession";
import { RentalPartiallyCreatedError } from "@/data/rentals.repo";

const searchCustomers = vi.fn();
const createCustomer = vi.fn();
const getCustomer = vi.fn();
const createRental = vi.fn();
const listRentalsForCustomer = vi.fn();
const navigate = vi.fn();
const clear = vi.fn();

// §14 gap-fill: `handleConfirm`'s catch block calls the real
// `staleSession.ts` helper, which calls `pb.authStore.clear()` — mocked
// the same way App.test.tsx already mocks `pb`.
vi.mock("@/data/pocketbaseClient", () => ({
  pb: { authStore: { clear: (...args: unknown[]) => clear(...args) } },
}));

vi.mock("@/data/customers.repo", () => ({
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  getCustomer: (...args: unknown[]) => getCustomer(...args),
}));

vi.mock("@/data/rentals.repo", async () => {
  const actual =
    await vi.importActual<typeof import("@/data/rentals.repo")>(
      "@/data/rentals.repo",
    );
  return {
    // `RentalPartiallyCreatedError` is real (not mocked) so `instanceof`
    // checks in both this file and `RentalNewScreen.tsx` keep working.
    RentalPartiallyCreatedError: actual.RentalPartiallyCreatedError,
    createRental: (...args: unknown[]) => createRental(...args),
    listRentalsForCustomer: (...args: unknown[]) => listRentalsForCustomer(...args),
  };
});

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return { ...actual, useNavigate: () => navigate };
});

const juan = { id: "c1", name: "Juan Pérez", phone: "5512345678" };

function renderScreen() {
  return render(
    <MemoryRouter>
      <RentalNewScreen />
    </MemoryRouter>,
  );
}

describe("RentalNewScreen (§7.1, §16.7, CU4)", () => {
  beforeEach(() => {
    searchCustomers.mockReset();
    createCustomer.mockReset();
    getCustomer.mockReset();
    createRental.mockReset();
    listRentalsForCustomer.mockReset();
    navigate.mockReset();
    clear.mockReset();
    consumeSessionMessage();
    vi.stubGlobal("navigator", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a validation error and never calls createRental when confirming with no customer/products", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    expect(
      await screen.findByText("Selecciona o crea un cliente."),
    ).toBeInTheDocument();
    expect(createRental).not.toHaveBeenCalled();
  });

  it("creates the rental (CU4: cliente existente) and opens the receipt with the server-assigned folio", async () => {
    searchCustomers.mockResolvedValue([juan]);
    createRental.mockResolvedValue({
      rental: {
        id: "r1",
        folio: "R-000001",
        created: "2026-08-26 10:00:00.000Z",
      },
      items: [{ id: "i1" }],
      depositPayment: { id: "p1" },
    });

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );

    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.type(
      screen.getByLabelText("Renta"),
      "2800",
    );
    await user.type(screen.getByLabelText("Depósito"), "1000");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await waitFor(() => expect(createRental).toHaveBeenCalledTimes(1));
    expect(createRental).toHaveBeenCalledWith({
      customerId: "c1",
      items: [{ itemType: "concentrator", quantity: 1 }],
      initialRentAmount: 2800,
      depositAmount: 1000,
      extras: [],
    });

    expect(
      await screen.findByRole("heading", { name: "Comprobante R-000001" }),
    ).toBeInTheDocument();
  });

  it("opens Ficha de cliente from the customer picker once a customer is selected (§16.6, task 3.5)", async () => {
    searchCustomers.mockResolvedValue([juan]);
    getCustomer.mockResolvedValue(juan);
    listRentalsForCustomer.mockResolvedValue([]);
    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );

    await user.click(screen.getByRole("button", { name: "Ver ficha" }));

    expect(
      await screen.findByRole("heading", { name: "Juan Pérez" }),
    ).toBeInTheDocument();
  });

  it("keeps the form filled and shows an error when the save fails (§21)", async () => {
    searchCustomers.mockResolvedValue([juan]);
    createRental.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );
    await user.click(screen.getByLabelText("Agregar un tanque"));
    await user.type(screen.getByLabelText("Renta"), "1500");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    expect(
      await screen.findByText(
        "No se pudo guardar la renta. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    // Customer selection survives the failed attempt (§21 — no recapturing).
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("gap-fill (deposit payment race): shows an honest message with the real folio — never the generic 'no se pudo guardar' — when createRental rejects with RentalPartiallyCreatedError (the rental itself DID save)", async () => {
    searchCustomers.mockResolvedValue([juan]);
    const partialError = new RentalPartiallyCreatedError(
      { id: "r1", folio: "R-000042" } as never,
      [],
      new Error("aborted"),
    );
    createRental.mockRejectedValue(partialError);

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );
    await user.click(screen.getByLabelText("Agregar un tanque"));
    await user.type(screen.getByLabelText("Renta"), "1500");
    await user.type(screen.getByLabelText("Depósito"), "12000");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    expect(await screen.findByText(/R-000042/)).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No se pudo guardar la renta. Verifica tu conexión e intenta de nuevo.",
      ),
    ).not.toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("gap-fill (deposit payment race): still redirects to /login instead of showing the partial-save message when a RentalPartiallyCreatedError wraps a stale-session-shaped cause", async () => {
    searchCustomers.mockResolvedValue([juan]);
    const staleCause = new ClientResponseError({
      status: 400,
      response: { message: "Failed to create record.", data: {} },
    });
    createRental.mockRejectedValue(
      new RentalPartiallyCreatedError(
        { id: "r1", folio: "R-000043" } as never,
        [],
        staleCause,
      ),
    );

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );
    await user.click(screen.getByLabelText("Agregar un tanque"));
    await user.type(screen.getByLabelText("Renta"), "1500");
    await user.type(screen.getByLabelText("Depósito"), "12000");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/R-000043/)).not.toBeInTheDocument();
    expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
  });

  it("clears the session instead of showing the generic save-error message when confirming fails with a stale-session-shaped error (§14 gap-fill)", async () => {
    searchCustomers.mockResolvedValue([juan]);
    createRental.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: { message: "Failed to create record.", data: {} },
      }),
    );

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );
    await user.click(screen.getByLabelText("Agregar un tanque"));
    await user.type(screen.getByLabelText("Renta"), "1500");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(
        "No se pudo guardar la renta. Verifica tu conexión e intenta de nuevo.",
      ),
    ).not.toBeInTheDocument();
    expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
  });

  it("shows a Guardando… loading label on the confirm button while submitting, reverting after success (§16.13)", async () => {
    searchCustomers.mockResolvedValue([juan]);
    let resolveCreateRental: (value: {
      rental: { id: string; folio: string; created: string };
      items: { id: string }[];
      depositPayment: { id: string };
    }) => void = () => {};
    createRental.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreateRental = resolve;
        }),
    );

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Juan Pérez/ }),
    );
    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.type(screen.getByLabelText("Renta"), "2800");
    await user.type(screen.getByLabelText("Depósito"), "1000");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();

    resolveCreateRental({
      rental: { id: "r1", folio: "R-000001", created: "2026-08-26 10:00:00.000Z" },
      items: [{ id: "i1" }],
      depositPayment: { id: "p1" },
    });

    expect(
      await screen.findByRole("heading", { name: "Comprobante R-000001" }),
    ).toBeInTheDocument();
  });
});
