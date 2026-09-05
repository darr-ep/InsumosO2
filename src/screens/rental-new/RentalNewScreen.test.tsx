import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
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

/**
 * design-fidelity Slice D3 (router migration prep, D3.4): swapped the plain
 * `<MemoryRouter>` for a `createMemoryRouter` data router — `RentalNewScreen`
 * doesn't call `useBlocker` yet (that's D1.5, a later batch), but D1.5's
 * exit-guard test coverage needs a REAL back-navigation entry to block,
 * which a bare `<MemoryRouter>` (no history stack beyond the initial entry)
 * can't exercise. The two-entry history (`/dashboard` → `/nueva-renta`,
 * starting on the second) means "navigate back" is a meaningful, testable
 * action here already, ready for D1.5 to build on without another router
 * swap.
 */
function renderScreen() {
  const router = createMemoryRouter(
    [
      { path: "/dashboard", element: <div /> },
      { path: "/nueva-renta", element: <RentalNewScreen /> },
    ],
    { initialEntries: ["/dashboard", "/nueva-renta"], initialIndex: 1 },
  );
  return render(
    <DataCacheProvider>
      <RouterProvider router={router} />
    </DataCacheProvider>,
  );
}

// design-fidelity D1.2 — the wizard's step navigation. Every step-changing
// action below goes through the single "Continuar"/"Atrás" footer button
// for that step, exactly like a real user.
function continueButton() {
  return screen.getByRole("button", { name: "Continuar" });
}
function backButton() {
  return screen.getByRole("button", { name: "Atrás" });
}
function confirmButton() {
  return screen.getByRole("button", { name: "Confirmar renta" });
}

async function selectExistingCustomer(user: UserEvent, name = "Juan") {
  await user.type(
    screen.getByLabelText("Buscar cliente por nombre o teléfono"),
    name,
  );
  await user.click(
    await screen.findByRole("button", { name: /Juan Pérez/ }),
  );
}

async function stageNewCustomerDraft(
  user: UserEvent,
  { query = "Juan Pérez", phone = "5512345678" } = {},
) {
  await user.type(
    screen.getByLabelText("Buscar cliente por nombre o teléfono"),
    query,
  );
  await user.click(
    await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
  );
  if (phone) {
    await user.type(screen.getByLabelText("Teléfono"), phone);
  }
}

async function goToStep2(user: UserEvent) {
  await user.click(continueButton());
}

async function fillItemsAndAmounts(
  user: UserEvent,
  { rent = "2800", deposit = "1000" }: { rent?: string; deposit?: string } = {},
) {
  await user.click(screen.getByLabelText("Agregar un concentrador"));
  if (rent) {
    await user.type(screen.getByLabelText("Renta"), rent);
  }
  if (deposit) {
    await user.type(screen.getByLabelText("Depósito"), deposit);
  }
}

async function goToStep3(user: UserEvent) {
  await user.click(continueButton());
}

describe("RentalNewScreen (§7.1, §16.7, CU4, design-fidelity D1 wizard)", () => {
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

  describe("step gating (D1.2)", () => {
    it("keeps 'Continuar' disabled at step 1 until a customer is selected or a complete draft exists — createRental is structurally unreachable", () => {
      renderScreen();

      expect(continueButton()).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Confirmar renta" }),
      ).not.toBeInTheDocument();
      expect(createRental).not.toHaveBeenCalled();
    });

    it("enables 'Continuar' at step 1 once an existing customer is selected", async () => {
      searchCustomers.mockResolvedValue([juan]);
      const user = userEvent.setup();
      renderScreen();

      await selectExistingCustomer(user);

      expect(continueButton()).not.toBeDisabled();
    });

    it("does not advance past step 2 without valid items+amounts, even though step 1 is already complete", async () => {
      searchCustomers.mockResolvedValue([juan]);
      const user = userEvent.setup();
      renderScreen();

      await selectExistingCustomer(user);
      await goToStep2(user);

      // Zero items — still gated.
      expect(continueButton()).toBeDisabled();

      await user.click(screen.getByLabelText("Agregar un concentrador"));
      // Item present, but no rent amount yet (server requires > 0).
      expect(continueButton()).toBeDisabled();

      await user.type(screen.getByLabelText("Renta"), "2800");
      expect(continueButton()).not.toBeDisabled();

      expect(createRental).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Confirmar renta" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("all-or-nothing persistence (D1.4)", () => {
    it("never calls createCustomer/createRental during any step transition, and calls each exactly once after the step-3 confirm button is tapped", async () => {
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

      await stageNewCustomerDraft(user);
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createRental).not.toHaveBeenCalled();

      await goToStep2(user); // 1 → 2
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createRental).not.toHaveBeenCalled();

      await fillItemsAndAmounts(user);
      await goToStep3(user); // 2 → 3
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createRental).not.toHaveBeenCalled();

      await user.click(backButton()); // 3 → 2
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createRental).not.toHaveBeenCalled();

      await goToStep3(user); // 2 → 3 again
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createRental).not.toHaveBeenCalled();

      await user.click(confirmButton());

      await waitFor(() => expect(createRental).toHaveBeenCalledTimes(1));
      expect(createCustomer).toHaveBeenCalledTimes(1);
    });
  });

  describe("back-navigation preservation (D1.3)", () => {
    it("preserves step 2's item/amount values across a back-then-forward round trip (hidden-gating, not conditional rendering)", async () => {
      searchCustomers.mockResolvedValue([juan]);
      const user = userEvent.setup();
      renderScreen();

      await selectExistingCustomer(user);
      await goToStep2(user);
      await fillItemsAndAmounts(user, { rent: "2800", deposit: "1000" });

      await user.click(backButton()); // 2 → 1
      // The selected customer survived too — CustomerPicker never
      // unmounted. Scoped via `getByRole` (not `getByText`) because step
      // 3's always-mounted, currently-`hidden` review panel also renders
      // "Juan Pérez" — `getByRole` excludes hidden content, `getByText`
      // does not.
      expect(
        screen.getByRole("button", { name: "Ver ficha" }),
      ).toBeInTheDocument();

      await goToStep2(user); // 1 → 2 again

      expect(
        screen.getByLabelText("Cantidad de concentrador"),
      ).toHaveTextContent("1");
      expect(screen.getByLabelText("Renta")).toHaveValue("$ 2,800");
      expect(screen.getByLabelText("Depósito")).toHaveValue("$ 1,000");
    });

    it("still shows the 'Cliente nuevo' form with the previously typed name/phone after going back to step 1", async () => {
      searchCustomers.mockResolvedValue([]);
      const user = userEvent.setup();
      renderScreen();

      await stageNewCustomerDraft(user, {
        query: "Juan Pérez",
        phone: "5512345678",
      });
      await goToStep2(user); // 1 → 2

      await user.click(backButton()); // 2 → 1

      // Still on the create-customer form (not back to the search field),
      // with the typed values intact.
      expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");
      expect(screen.getByLabelText("Teléfono")).toHaveValue("5512345678");
    });
  });

  it("shows the 'Paso 1 · Cliente · Nuevo' breadcrumb while creating a new customer, mirrored from CustomerPicker's onCreatingChange (D1.3)", async () => {
    searchCustomers.mockResolvedValue([]);
    const user = userEvent.setup();
    renderScreen();

    expect(screen.getByText("Paso 1 de 3 · Cliente")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Buscar cliente por nombre o teléfono"),
      "Juan Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Crear cliente nuevo/ }),
    );

    expect(
      await screen.findByText("Paso 1 de 3 · Cliente · Nuevo"),
    ).toBeInTheDocument();
  });

  it("shows a live 'Total a cobrar' summing Renta + Depósito on step 3's read-only review (Redesign — UX/UI pass, moved by design-fidelity D1)", async () => {
    searchCustomers.mockResolvedValue([juan]);
    const user = userEvent.setup();
    renderScreen();

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "1000" });
    await goToStep3(user);

    const totalRow = screen.getByText("Total a cobrar").closest("div")!;
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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "1000" });
    await goToStep3(user);

    await user.click(confirmButton());

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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "1000" });
    await goToStep3(user);

    await user.click(confirmButton());

    // The summary dialog's own "Continuar" is queried after the underlying
    // wizard has reset back to step 1 (post-success `resetForm`) — Radix
    // Dialog `aria-hidden`s the rest of the page while open, so this
    // unambiguously resolves to the dialog's button, not the wizard's.
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

    await selectExistingCustomer(user);

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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "1500", deposit: "" });
    await goToStep3(user);

    await user.click(confirmButton());

    expect(
      await screen.findByText(
        "No se pudo guardar la renta. Verifica tu conexión e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();

    // Customer selection survives the failed attempt (§21 — no
    // recapturing) — still visible once back at step 1. `getByRole` (not
    // `getByText`): step 3's always-mounted, currently-`hidden` review
    // panel also renders "Juan Pérez".
    await user.click(backButton()); // 3 → 2
    await user.click(backButton()); // 2 → 1
    expect(
      screen.getByRole("button", { name: "Ver ficha" }),
    ).toBeInTheDocument();
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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "1500", deposit: "12000" });
    await goToStep3(user);

    await user.click(confirmButton());

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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "1500", deposit: "12000" });
    await goToStep3(user);

    await user.click(confirmButton());

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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "1500", deposit: "" });
    await goToStep3(user);

    await user.click(confirmButton());

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

    await selectExistingCustomer(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "1000" });
    await goToStep3(user);

    await user.click(confirmButton());

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

    // Staging the draft must not hit the network at all.
    expect(createCustomer).not.toHaveBeenCalled();
    await waitFor(() => expect(continueButton()).not.toBeDisabled());

    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "1000" });
    await goToStep3(user);

    await user.click(confirmButton());

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

    await stageNewCustomerDraft(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "" });
    await goToStep3(user);

    await user.click(confirmButton());

    expect(
      await screen.findByText("No se pudo guardar el cliente. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(createRental).not.toHaveBeenCalled();
  });

  it("promotes a 'Cliente nuevo' draft to a real selected customer as soon as it's saved, even if createRental then fails — so retrying never creates a duplicate customer", async () => {
    searchCustomers.mockResolvedValue([]);
    createCustomer.mockResolvedValue(juan);
    createRental.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    renderScreen();

    await stageNewCustomerDraft(user);
    await goToStep2(user);
    await fillItemsAndAmounts(user, { rent: "2800", deposit: "" });
    await goToStep3(user);

    await user.click(confirmButton());

    await waitFor(() => expect(createRental).toHaveBeenCalledTimes(1));
    expect(createCustomer).toHaveBeenCalledTimes(1);

    await user.click(confirmButton());

    await waitFor(() => expect(createRental).toHaveBeenCalledTimes(2));
    expect(createCustomer).toHaveBeenCalledTimes(1); // still only once
  });
});
