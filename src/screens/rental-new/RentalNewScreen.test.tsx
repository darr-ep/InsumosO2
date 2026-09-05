import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ClientResponseError } from "pocketbase";
import { RentalNewScreen } from "@/screens/rental-new/RentalNewScreen";
import { DataCacheProvider } from "@/app/DataCacheContext";
import { consumeSessionMessage, STALE_SESSION_MESSAGE } from "@/data/staleSession";
import { RentalPartiallyCreatedError } from "@/data/rentals.repo";

const searchCustomers = vi.fn();
const createCustomer = vi.fn();
const getCustomer = vi.fn();
const createRental = vi.fn();
const listRentalsForCustomer = vi.fn();
const listActiveRentals = vi.fn();
const listActiveRentalItems = vi.fn();
const getBusinessSettings = vi.fn();
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
    // DataCacheContext's `refreshRentals` (fired fire-and-forget after a
    // successful createRental, see RentalNewScreen.tsx) pulls in these two
    // too — without them mocked here, the background refresh rejects with a
    // real TypeError (undefined mock) instead of the intended no-op.
    listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
    listActiveRentalItems: (...args: unknown[]) => listActiveRentalItems(...args),
  };
});

vi.mock("@/data/settings.repo", () => ({
  getBusinessSettings: (...args: unknown[]) => getBusinessSettings(...args),
}));

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
      <DataCacheProvider>
        <RentalNewScreen />
      </DataCacheProvider>
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
    listActiveRentals.mockReset().mockResolvedValue([]);
    listActiveRentalItems.mockReset().mockResolvedValue([]);
    getBusinessSettings.mockReset().mockResolvedValue({
      id: "s1",
      total_concentradores: 0,
      total_tanques: 0,
    });
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

  it("shows a live 'Total a cobrar' summing Renta + Depósito, never a fixed/autofilled price (Redesign — UX/UI pass)", async () => {
    const user = userEvent.setup();
    renderScreen();

    const totalRow = screen.getByText("Total a cobrar").closest("div")!;
    expect(within(totalRow).getByText("$0.00")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Renta"), "2800");
    await user.type(screen.getByLabelText("Depósito"), "1000");

    expect(within(totalRow).getByText("$3,800.00")).toBeInTheDocument();
  });

  it("creates the rental (CU4: cliente existente) with the server-assigned folio", async () => {
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
    });

    expect(
      await screen.findByRole("heading", { name: "Renta creada ✓" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Folio R-000001")).toBeInTheDocument();
  });

  it("navigates to /dashboard when Continuar is pressed on the short confirmation (Redesign Round 3)", async () => {
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
    await user.type(screen.getByLabelText("Renta"), "2800");
    await user.type(screen.getByLabelText("Depósito"), "1000");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await user.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );

    expect(navigate).toHaveBeenCalledWith("/dashboard");
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
      await screen.findByRole("heading", { name: "Renta creada ✓" }),
    ).toBeInTheDocument();
  });

  it("stages a customer draft via the unified search-or-create field (typed live, no button), then creates it (and only then the rental) at confirm time", async () => {
    searchCustomers.mockResolvedValue([]);
    createCustomer.mockResolvedValue(juan);
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
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );
    // "Nombre" arrives pre-filled from the search query.
    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");

    // Typing alone stages the draft (`CustomerForm`'s `liveReport` mode) —
    // no "Continuar"/submit button exists in this flow anymore.
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();
    // Staging the draft must not hit the network at all.
    expect(createCustomer).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.type(screen.getByLabelText("Renta"), "2800");
    await user.type(screen.getByLabelText("Depósito"), "1000");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await waitFor(() => expect(createRental).toHaveBeenCalledTimes(1));
    expect(createCustomer).toHaveBeenCalledTimes(1);
    // The customer must be created before the rental, using its real id.
    expect(createCustomer.mock.invocationCallOrder[0]).toBeLessThan(
      createRental.mock.invocationCallOrder[0],
    );
    expect(createRental).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "c1" }),
    );
  });

  it("shows the generic save-error message and never calls createRental when createCustomer fails for a 'Cliente nuevo' draft", async () => {
    searchCustomers.mockResolvedValue([]);
    createCustomer.mockRejectedValueOnce(new Error("network down"));

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");

    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.type(screen.getByLabelText("Renta"), "2800");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    expect(
      await screen.findByText("No se pudo guardar el cliente. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(createRental).not.toHaveBeenCalled();
  });

  it("shows a validation error and never calls createCustomer when 'Confirmar renta' is pressed with an incomplete 'Cliente nuevo' draft", async () => {
    searchCustomers.mockResolvedValue([]);
    const user = userEvent.setup();
    renderScreen();

    // Only the name (from the search query) is filled — phone is left empty.
    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );
    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");

    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.type(screen.getByLabelText("Renta"), "2800");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    expect(
      await screen.findByText("El teléfono debe tener 10 dígitos."),
    ).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createRental).not.toHaveBeenCalled();
  });

  it("promotes a 'Cliente nuevo' draft to a real selected customer as soon as it's saved, even if createRental then fails — so retrying never creates a duplicate customer", async () => {
    searchCustomers.mockResolvedValue([]);
    createCustomer.mockResolvedValue(juan);
    createRental.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    renderScreen();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");

    await user.click(screen.getByLabelText("Agregar un concentrador"));
    await user.type(screen.getByLabelText("Renta"), "2800");

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await waitFor(() => expect(createRental).toHaveBeenCalledTimes(1));
    expect(createCustomer).toHaveBeenCalledTimes(1);
    // Promoted to a real, selected customer — no longer the pending draft.
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar renta" }));

    await waitFor(() => expect(createRental).toHaveBeenCalledTimes(2));
    expect(createCustomer).toHaveBeenCalledTimes(1); // still only once
  });
});
